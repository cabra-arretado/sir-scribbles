import { EventEmitter } from 'node:events';
import { AcpSession } from './acp.js';
import { launchKiro, validateExecutable, terminateOwnedProcess } from './process.js';
import { OperationalError, LIMITS } from './limits.js';
import { composePrompt } from './draft.js';

export const ERROR_TEXT = {
  ABSOLUTE_EXECUTABLE_REQUIRED: 'Choose the absolute path to your installed Kiro executable.',
  EXECUTABLE_NOT_AVAILABLE: 'That file is unavailable or not executable. Change the Kiro path in Settings → Community plugins → obsidian-noter, then start a new chat to retry.',
  MACOS_REQUIRED: 'This preview supports macOS desktop only.',
  STARTUP_TIMEOUT: 'Kiro did not become ready within 15 seconds. Check your CLI login and V3 installation, then start a new chat.',
  INCOMPATIBLE_PROTOCOL: 'Kiro returned an unsupported protocol. Check your V3 installation.',
  AGENT_REQUEST_FAILED: 'Kiro could not complete the request. Check login in your terminal and V3 compatibility. Previous execution may have occurred.',
  SELECT_TEXT_FIRST: 'Select text in a Markdown note first, then attach it here.',
  OPEN_NOTE_FIRST: 'Open a Markdown note first, then attach it here.',
  PROMPT_LIMIT: 'The prompt and attached context exceed 128 KiB. Shorten the draft or attach less context; nothing was sent.',
  EMPTY_PROMPT: 'Write a prompt or attach context first.',
  FRAME_LIMIT: 'Kiro exceeded the incoming message limit. The connection was ended.',
  SESSION_LIMIT: 'This conversation exceeded its memory budget. Start a new chat.',
  PERMISSION_LIMIT: 'Kiro exceeded the approval queue limit. The connection was ended.',
  CLEANUP_UNCERTAIN: 'Kiro cleanup could not be confirmed. Force stop again before starting another process.',
  TRANSPORT_LOST: 'The Kiro connection was lost. The previous task outcome may be uncertain. Start a new chat; no prompt will be replayed.',
  PROCESS_EXITED: 'Kiro exited. Check your terminal login and V3 installation. The previous task outcome may be uncertain.',
  PROCESS_FAILED: 'Kiro could not start. Check the executable, CLI login and V3 installation.',
};
export const errorText = code => ERROR_TEXT[code] ?? `Kiro stopped (${code || 'UNKNOWN_ERROR'}). The previous task outcome may be uncertain. Start a new chat.`;

export class ChatController extends EventEmitter {
  constructor(cwd, { launch = launchKiro, validate = validateExecutable, createSession = child => new AcpSession(child), getSourcePath = () => '' } = {}) {
    super();
    this.cwd = cwd;
    this.launch = launch;
    this.validate = validate;
    this.createSession = createSession;
    this.getSourcePath = getSourcePath;
    this.turnSourcePath = '';
    this.state = 'not-started';
    this.session = null;
    this.messages = [];
    this.tools = new Map();
    this.draft = '';
    this.selection = null;
    this.identity = '';
    this.error = '';
    this.cleanup = '';
    this.forceAvailable = false;
    this.generation = 0;
    this.disposed = false;
    this.resetting = false;
    this.uiBytes = 0;
  }
  changed() { this.emit('change'); }
  setDraft(text) { this.draft = text; } // Typing never launches or recreates the composer.
  attach(selection) {
    composePrompt(this.draft, selection);
    this.selection = selection;
    this.error = '';
    this.changed();
  }
  removeSelection() { this.selection = null; this.changed(); }
  activePermission() { return this.session?.permissions.values().next().value ?? null; }
  setError(code) { this.error = errorText(code); this.changed(); }

  async start(executable) {
    if (this.disposed || this.resetting || this.state !== 'not-started' || this.session) return;
    const generation = ++this.generation;
    this.state = 'starting';
    this.error = '';
    this.cleanup = '';
    this.changed();
    try {
      await this.validate(executable);
      if (this.disposed || generation !== this.generation) return;
      const session = this.createSession(this.launch(executable, this.cwd));
      this.session = session;
      session.extraRetainedBytes = () => this.uiBytes;
      const live = () => !this.disposed && generation === this.generation;
      session.on('state', state => {
        if (live()) { this.state = state; this.changed(); }
      });
      session.on('update', update => { if (live()) this.update(update); });
      for (const event of ['permission', 'permission-settled', 'permissions-cancelled']) {
        session.on(event, () => { if (live()) this.changed(); });
      }
      session.on('unsupported-permission', code => {
        if (live()) { this.error = `Unsupported approval (${code}). The request was cancelled.`; this.changed(); }
      });
      session.on('force-stop-available', () => {
        if (live()) { this.forceAvailable = true; this.changed(); }
      });
      session.on('failure', code => {
        if (live() && code !== 'SESSION_CLOSED') { this.error = errorText(code); this.changed(); }
      });
      session.on('cleanup', result => {
        if (live()) {
          this.cleanup = result;
          if (result === 'uncertain') { this.error = errorText('CLEANUP_UNCERTAIN'); this.forceAvailable = true; }
          this.changed();
        }
      });
      const initialized = await session.start(this.cwd);
      if (live()) {
        this.identity = [initialized.identity?.title ?? initialized.identity?.name, initialized.identity?.version]
          .filter(value => typeof value === 'string').join(' · ');
        this.changed();
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.state = this.session ? 'failed' : 'not-started';
        this.setError(error.code || 'PROCESS_FAILED');
      }
    }
  }

  retainUi(bytes) {
    // Bound rendered/reconstructed data as well as the wire budget. The two
    // counters cover different representations; neither drops approval details.
    if (this.uiBytes + bytes + (this.session?.retainedBytes ?? 0) > LIMITS.session) {
      this.session?.fail('SESSION_LIMIT');
      return false;
    }
    this.uiBytes += bytes;
    return true;
  }

  update(update) {
    if (update.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text' && typeof update.content.text === 'string') {
      const text = update.content.text;
      if (!this.retainUi(Buffer.byteLength(text))) return;
      const last = this.messages.at(-1);
      if (last?.role === 'agent') last.text += text;
      else this.messages.push({ role: 'agent', text, timestamp: Date.now(), sourcePath: this.turnSourcePath });
    } else if (['tool_call', 'tool_call_update'].includes(update.sessionUpdate) && typeof update.toolCallId === 'string') {
      const previous = this.tools.get(update.toolCallId);
      const data = { ...previous?.data };
      for (const [key, value] of Object.entries(update)) if (value != null) data[key] = value;
      // Incoming JSON is already byte/depth bounded by the transport. Keep its
      // display representation compact so nesting cannot multiply allocations
      // through indentation before the session-budget check.
      const text = JSON.stringify(data);
      if (!this.retainUi(Buffer.byteLength(text))) return;
      if (previous) { previous.data = data; previous.text = text; }
      else {
        const entry = { role: 'tool', data, text, timestamp: Date.now() };
        this.tools.set(update.toolCallId, entry);
        this.messages.push(entry);
      }
    } else return;
    this.changed();
  }

  async send(executable = '') {
    if (this.resetting || this.disposed || !['not-started', 'ready'].includes(this.state)) return;
    if (this.state === 'not-started' && !executable) return;
    let prompt;
    try { prompt = composePrompt(this.draft, this.selection); }
    catch (error) { this.setError(error.code); return; }
    const originalDraft = this.draft;
    const originalSelection = this.selection;
    const sourcePath = this.selection?.path ?? this.getSourcePath();
    if (this.state === 'not-started') {
      const starting = this.start(executable);
      const startupGeneration = this.generation;
      await starting;
      if (this.disposed || this.resetting || this.generation !== startupGeneration || this.state !== 'ready') return;
      if (this.draft !== originalDraft || this.selection !== originalSelection) {
        this.error = 'The draft changed while Kiro was starting. Review it and send again.';
        this.changed();
        return;
      }
    }
    const session = this.session;
    const generation = this.generation;
    if (!this.retainUi(Buffer.byteLength(prompt))) return;
    this.turnSourcePath = sourcePath;
    this.messages.push({ role: 'user', text: prompt, timestamp: Date.now() });
    // Preserve a failure snapshot in the user entry; retain the composer draft
    // until successful settlement and never overwrite a newer draft.
    this.draft = '';
    this.selection = null;
    this.error = '';
    this.forceAvailable = false;
    const turn = session.prompt(prompt);
    this.changed();
    try {
      await turn;
    } catch (error) {
      if (generation === this.generation && !this.disposed) {
        if (!this.draft && !this.selection) { this.draft = originalDraft; this.selection = originalSelection; }
        this.setError(error.code);
      }
    } finally {
      if (generation === this.generation && !this.disposed) this.changed();
    }
  }

  decide(card, optionId) {
    if (this.resetting || this.disposed || card !== this.activePermission()) return false;
    try { return this.session.decide(card.id, optionId); }
    catch (error) { this.session.fail(error.code || 'WRITE_FAILED'); return false; }
  }
  stop() {
    if (this.state === 'starting' && !this.session) {
      ++this.generation;
      this.state = 'not-started';
      this.changed();
    } else this.session?.stop();
  }
  async forceStop() {
    if (!this.forceAvailable || this.resetting || !this.session) return;
    this.forceAvailable = false;
    this.state = 'stopping';
    this.changed();
    if (this.cleanup === 'uncertain') {
      try { await terminateOwnedProcess(this.session.child); this.cleanup = 'observed'; }
      catch { this.cleanup = 'uncertain'; }
    } else {
      const result = await this.session.close();
      this.cleanup = result === false ? 'uncertain' : 'observed';
    }
    this.state = 'terminated';
    if (this.cleanup === 'uncertain') { this.forceAvailable = true; this.setError('CLEANUP_UNCERTAIN'); }
    this.changed();
  }

  async newChat() {
    if (this.resetting || this.disposed) return false;
    this.resetting = true;
    ++this.generation; // Immediately invalidates old callbacks and startup awaits.
    this.state = 'stopping';
    this.changed();
    const result = await this.session?.close();
    if (result === false && this.cleanup !== 'observed') {
      this.resetting = false;
      this.state = 'failed';
      this.cleanup = 'uncertain';
      this.forceAvailable = true;
      this.setError('CLEANUP_UNCERTAIN');
      return false;
    }
    this.session?.removeAllListeners();
    this.session = null;
    this.messages = [];
    this.turnSourcePath = '';
    this.tools.clear();
    this.draft = '';
    this.selection = null;
    this.identity = '';
    this.error = '';
    this.cleanup = '';
    this.uiBytes = 0;
    this.forceAvailable = false;
    this.resetting = false;
    this.state = 'not-started';
    this.changed();
    return true;
  }

  async dispose() {
    this.disposed = true;
    ++this.generation;
    this.draft = '';
    this.selection = null;
    this.messages = [];
    this.turnSourcePath = '';
    this.tools.clear();
    this.removeAllListeners();
    const result = await this.session?.close();
    this.session?.removeAllListeners();
    return result !== false || this.cleanup === 'observed';
  }

  recoverCleanup() {
    // Reopening after an uncertain close retains the old process owner and
    // exposes only recovery, never a second executable launch.
    this.disposed = false;
    this.state = 'failed';
    this.cleanup = 'uncertain';
    this.forceAvailable = true;
    this.error = errorText('CLEANUP_UNCERTAIN');
  }
}
