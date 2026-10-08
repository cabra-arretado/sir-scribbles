import { EventEmitter } from 'node:events';
import { AcpSession } from './acp.js';
import { launchAgent, validateExecutable, terminateOwnedProcess } from './process.js';
import { OperationalError, LIMITS, mergeDefined } from './limits.js';
import { composePrompt } from './draft.js';
import { checkAttachments } from './attachments.js';

export const ERROR_TEXT = {
  ABSOLUTE_EXECUTABLE_REQUIRED: 'Choose the absolute path to your installed agent executable.',
  EXECUTABLE_NOT_AVAILABLE: 'That file is unavailable or not executable. Change the agent path in Settings → Community plugins → Sir Scribbles, then start a new chat to retry.',
  MACOS_REQUIRED: 'This preview supports macOS desktop only.',
  STARTUP_TIMEOUT: 'The agent did not become ready within 15 seconds. Check its login and installation, then start a new chat.',
  INCOMPATIBLE_PROTOCOL: 'The agent returned an unsupported protocol. Check its installation and version.',
  AGENT_REQUEST_FAILED: 'The agent could not complete the request. Check its login in your terminal and its version. Previous execution may have occurred.',
  SELECT_TEXT_FIRST: 'Select text in a Markdown note first, then attach it here.',
  OPEN_NOTE_FIRST: 'Open a Markdown note first, then attach it here.',
  PROMPT_LIMIT: 'The prompt and attached context exceed 128 KiB. Shorten the draft or attach less context; nothing was sent.',
  EMPTY_PROMPT: 'Write a prompt or attach context first.',
  FILE_TYPE_UNSUPPORTED: 'Only images (PNG, JPEG, GIF, WebP) and text files can be attached.',
  FILE_NOT_TEXT: 'That file is not UTF-8 text, so it was not attached.',
  FILE_UNREADABLE: 'That file could not be read, so it was not attached.',
  ATTACHMENT_LIMIT: `Attach at most ${LIMITS.attachments} files to one prompt.`,
  IMAGE_LIMIT: `Attach at most ${LIMITS.images} images, ${LIMITS.imageBytes / (1024 * 1024)} MB in total after resizing, to one prompt.`,
  IMAGES_NOT_SUPPORTED: 'This agent does not accept images. Remove them to send; nothing was sent.',
  FRAME_LIMIT: 'The agent exceeded the incoming message limit. The connection was ended.',
  SESSION_LIMIT: 'This conversation exceeded its memory budget. Start a new chat.',
  PERMISSION_LIMIT: 'The agent exceeded the approval queue limit. The connection was ended.',
  CLEANUP_UNCERTAIN: 'Agent cleanup could not be confirmed. Force stop again before starting another process.',
  TRANSPORT_LOST: 'The agent connection was lost. The previous task outcome may be uncertain. Start a new chat; no prompt will be replayed.',
  PROCESS_EXITED: 'The agent exited. Check its login and installation in your terminal. The previous task outcome may be uncertain.',
  PROCESS_FAILED: 'The agent could not start. Check the executable, its login and installation.',
  CONFIG_REJECTED: 'The agent did not change the model. It keeps the previous one.',
  CONFIG_VALUE_UNKNOWN: 'The agent no longer offers that model. Choose another one.',
  CONFIG_TIMEOUT: 'The agent did not confirm the model change within 15 seconds. It may still apply it; the picker shows the model it last reported.',
  HISTORY_TIMEOUT: 'The agent did not list past chats within 15 seconds. Try again, or start a new chat.',
  HISTORY_NOT_SUPPORTED: 'This agent cannot list past chats. Start a new chat instead.',
  HISTORY_UNAVAILABLE: 'The agent could not list past chats. Try again, or start a new chat.',
  LOAD_NOT_SUPPORTED: 'This agent cannot reopen past chats. Start a new chat instead.',
};
// One line, short enough for a tab.
const titleOf = text => {
  const line = text.split('\n').map(part => part.trim()).find(Boolean) ?? '';
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
};
export const errorText = code => ERROR_TEXT[code] ?? `The agent stopped (${code || 'UNKNOWN_ERROR'}). The previous task outcome may be uncertain. Start a new chat.`;

export class ChatController extends EventEmitter {
  constructor(cwd, { launch = launchAgent, validate = validateExecutable, createSession = child => new AcpSession(child), getSourcePath = () => '' } = {}) {
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
    this.file = null;
    this.attachments = []; // Replaced, never mutated, so a changed draft is detectable.
    this.identity = '';
    this.configOptions = [];
    this.configPending = false;
    this.error = '';
    this.cleanup = '';
    this.forceAvailable = false;
    this.generation = 0;
    this.disposed = false;
    this.resetting = false;
    this.uiBytes = 0;
    this.title = '';
    this.history = null; // { pending } | { entries } | { error } while choosing a chat.
    this.loading = false; // Replaying a past chat: its messages have no local time.
    this.recent = null; // { entries } of past chats, offered while a started chat is still empty.
  }
  changed() { this.emit('change'); }
  setDraft(text) { this.draft = text; } // Typing never launches or recreates the composer.
  attach(selection) {
    const file = selection.kind === 'file' ? selection : this.file;
    const textSelection = selection.kind === 'file' ? this.selection : selection;
    composePrompt(this.draft, textSelection, file, undefined, this.attachments);
    this.selection = textSelection;
    this.file = file;
    this.error = '';
    this.changed();
  }
  removeFile() { this.file = null; this.changed(); }
  removeSelection() { this.selection = null; this.changed(); }
  // Adds read files to the draft, or throws without changing it.
  addAttachments(items) {
    const attachments = [...this.attachments, ...items];
    checkAttachments(attachments);
    if (items.some(item => item.kind === 'image') && this.supportsImages() === false) throw new OperationalError('IMAGES_NOT_SUPPORTED');
    composePrompt(this.draft, this.selection, this.file, undefined, attachments);
    this.attachments = attachments;
    this.error = '';
    this.changed();
  }
  removeAttachment(item) { this.attachments = this.attachments.filter(entry => entry !== item); this.changed(); }
  // Unknown until the agent has started and said so.
  supportsImages() { return this.session?.capabilities ? Boolean(this.session.canPromptImages?.()) : null; }
  hasDraft() { return Boolean(this.draft.trim() || this.selection || this.file || this.attachments.length); }
  // The session's model choice, if the agent offers one as a config option.
  modelOption() { return this.configOptions.find(option => option.category === 'model') ?? null; }
  activePermission() { return this.session?.permissions.values().next().value ?? null; }
  setError(code) { this.error = errorText(code); this.changed(); }

  // Launches the agent and initializes it, without opening a chat yet.
  async connect(executable) {
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
      session.on('config-options', options => {
        if (live()) { this.configOptions = options; this.changed(); }
      });
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
      const initialized = await session.connect();
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

  async start(executable, { listPast = false } = {}) {
    await this.connect(executable);
    if (this.state === 'connected') await this.open();
    if (listPast) await this.listRecent();
  }

  // Past chats to offer in a started but still empty chat. Best effort: a
  // refused listing just shows none.
  async listRecent() {
    const session = this.session;
    if (this.state !== 'ready' || this.messages.length || !session?.canLoad()) return;
    const generation = this.generation;
    let entries;
    try { entries = await session.listSessions(this.cwd); }
    catch { return; }
    if (generation !== this.generation || this.disposed || this.messages.length) return;
    entries = entries.filter(entry => entry.sessionId !== session.sessionId);
    this.recent = entries.length ? { entries } : null;
    this.changed();
  }

  // Leaves the empty chat for a past one. The agent restarts so the past chat
  // opens the same way as from Open a past chat. The composer stays live
  // throughout, so edits made while the old process closes are kept.
  async reopen(executable, sessionId, title = '') {
    if (this.state !== 'ready' || this.messages.length || this.configPending || this.resetting || this.disposed) return;
    const entries = this.recent?.entries ?? [];
    if (!(await this.newChat({ keepComposer: true }))) return;
    await this.connect(executable);
    if (this.state !== 'connected') return;
    // The same picker as Open a past chat: if the agent refuses this chat,
    // the list and its new-chat choice stay on screen.
    this.history = { entries };
    await this.open(sessionId, title);
  }

  // Lists this vault's past chats so the user can reopen one. Starts the
  // agent when needed; the chat itself is opened only on a choice.
  async browse(executable = '') {
    if (this.disposed || this.resetting || this.history?.pending) return;
    if (this.state === 'not-started') {
      if (!executable) return;
      await this.connect(executable);
    }
    if (this.state !== 'connected' || this.disposed || this.resetting) return;
    const session = this.session;
    const generation = this.generation;
    this.history = { pending: true };
    this.error = '';
    this.changed();
    let history;
    // Listing chats that cannot be reopened would only lead to a dead end.
    if (!session.canLoad()) history = { error: errorText('LOAD_NOT_SUPPORTED') };
    else try { history = { entries: await session.listSessions(this.cwd) }; }
    catch (error) { history = { error: errorText(error.code), retry: error.code !== 'HISTORY_NOT_SUPPORTED' }; }
    if (generation !== this.generation || this.disposed || this.state !== 'connected') return;
    this.history = history;
    this.changed();
  }

  // Opens a new chat, or reopens a past one by its session ID.
  async open(sessionId = null, title = '') {
    if (this.disposed || this.resetting || this.state !== 'connected' || this.history?.pending) return;
    const session = this.session;
    const generation = this.generation;
    const live = () => !this.disposed && generation === this.generation;
    this.loading = Boolean(sessionId);
    if (sessionId) this.title = title;
    this.error = '';
    this.changed();
    try {
      const opened = await session.open(this.cwd, sessionId);
      if (live()) { this.history = null; this.configOptions = opened.configOptions ?? []; }
    } catch (error) {
      // A refusal before any request leaves the agent connected: keep the
      // picker and its new-chat fallback. Anything else ended the agent.
      if (live()) {
        if (!session.transportClosed && session.state === 'connected') this.state = 'connected';
        else this.state = 'failed';
        this.setError(error.code || 'START_FAILED');
      }
    } finally {
      if (live()) { this.loading = false; this.changed(); }
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
    const kind = update.sessionUpdate;
    // Agents send the user's side only when replaying a past chat.
    const role = kind === 'agent_message_chunk' ? 'agent' : kind === 'user_message_chunk' && this.loading ? 'user' : '';
    if (role && update.content?.type === 'text' && typeof update.content.text === 'string') {
      const text = update.content.text;
      if (!this.retainUi(Buffer.byteLength(text))) return;
      const last = this.messages.at(-1);
      const messageId = typeof update.messageId === 'string' ? update.messageId : undefined;
      if (last?.role === role && last.messageId === messageId) last.text += text;
      else this.messages.push({ role, text, messageId, timestamp: this.loading ? null : Date.now(), sourcePath: this.turnSourcePath });
      if (role === 'user' && !this.title) this.title = titleOf(text);
    } else if (kind === 'session_info_update' && typeof update.title === 'string' && update.title.trim()) {
      this.title = titleOf(update.title);
    } else if (['tool_call', 'tool_call_update'].includes(update.sessionUpdate) && typeof update.toolCallId === 'string') {
      const previous = this.tools.get(update.toolCallId);
      const data = mergeDefined(mergeDefined({}, previous?.data ?? {}), update);
      // Incoming JSON is already byte/depth bounded by the transport. Keep its
      // display representation compact so nesting cannot multiply allocations
      // through indentation before the session-budget check.
      const text = JSON.stringify(data);
      if (!this.retainUi(Buffer.byteLength(text))) return;
      if (previous) { previous.data = data; previous.text = text; }
      else {
        const entry = { role: 'tool', data, text, timestamp: this.loading ? null : Date.now() };
        this.tools.set(update.toolCallId, entry);
        this.messages.push(entry);
      }
    } else return;
    this.changed();
  }

  async send(executable = '') {
    if (this.resetting || this.disposed || this.configPending || this.history?.pending || !['not-started', 'connected', 'ready'].includes(this.state)) return;
    if (this.state === 'not-started' && !executable) return;
    let prompt;
    try { prompt = composePrompt(this.draft, this.selection, this.file, undefined, this.attachments); }
    catch (error) { this.setError(error.code); return; }
    const originalDraft = this.draft;
    const originalSelection = this.selection;
    const originalFile = this.file;
    const originalAttachments = this.attachments;
    const sourcePath = this.selection?.path ?? this.file?.path ?? this.getSourcePath();
    if (this.state !== 'ready') {
      // A typed prompt while choosing a past chat starts a new one.
      const starting = this.state === 'connected' ? this.open() : this.start(executable);
      const startupGeneration = this.generation;
      await starting;
      if (this.disposed || this.resetting || this.generation !== startupGeneration || this.state !== 'ready') return;
      if (this.draft !== originalDraft || this.selection !== originalSelection || this.file !== originalFile || this.attachments !== originalAttachments) {
        this.error = 'The draft changed while the agent was starting. Review it and send again.';
        this.changed();
        return;
      }
    }
    const session = this.session;
    const generation = this.generation;
    const images = originalAttachments.filter(item => item.kind === 'image');
    if (images.length && !session.canPromptImages?.()) { this.setError('IMAGES_NOT_SUPPORTED'); return; }
    // The transcript keeps names and thumbnails only, never the image data.
    const attachments = originalAttachments.map(({ kind, name, size, preview = '' }) => ({ kind, name, size, preview }));
    if (!this.retainUi(Buffer.byteLength(prompt) + attachments.reduce((total, item) => total + item.name.length + item.preview.length, 0))) return;
    this.turnSourcePath = sourcePath;
    if (!this.title) this.title = titleOf(originalDraft) || titleOf(attachments[0]?.name ?? '') || titleOf(sourcePath);
    this.messages.push({ role: 'user', text: prompt, attachments, timestamp: Date.now() });
    // Preserve a failure snapshot in the user entry; retain the composer draft
    // until successful settlement and never overwrite a newer draft.
    this.draft = '';
    this.selection = null;
    this.file = null;
    this.attachments = [];
    this.error = '';
    this.forceAvailable = false;
    const turn = session.prompt(prompt, images.map(({ mimeType, data }) => ({ mimeType, data })));
    this.changed();
    try {
      await turn;
    } catch (error) {
      if (generation === this.generation && !this.disposed) {
        if (!this.hasDraft()) { this.draft = originalDraft; this.selection = originalSelection; this.file = originalFile; this.attachments = originalAttachments; }
        this.setError(error.code);
      }
    } finally {
      if (generation === this.generation && !this.disposed) this.changed();
    }
  }

  async setModel(value) {
    const option = this.modelOption();
    if (!option || this.state !== 'ready' || this.configPending || this.resetting || this.disposed) return;
    if (value === option.currentValue) return;
    const session = this.session;
    const generation = this.generation;
    this.configPending = true;
    this.error = '';
    this.changed();
    try { await session.setConfigOption(option.id, value); }
    catch (error) {
      // Transport failures already reported their own error.
      if (generation === this.generation && !this.disposed && !session.transportClosed) this.setError(error.code);
    } finally {
      if (generation === this.generation && !this.disposed) { this.configPending = false; this.changed(); }
    }
  }

  decide(card, optionId) {
    if (this.resetting || this.disposed || card !== this.activePermission()) return false;
    try { return this.session.decide(card.id, optionId); }
    catch (error) { this.session.fail(error.code || 'WRITE_FAILED'); return false; }
  }
  stop() {
    if (this.state === 'connected') {
      void this.newChat(); // No chat is open yet: end the agent instead.
    } else if (this.state === 'starting' && !this.session) {
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

  async newChat({ keepComposer = false } = {}) {
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
    if (!keepComposer) {
      this.draft = '';
      this.selection = null;
      this.file = null;
      this.attachments = [];
    }
    this.identity = '';
    this.configOptions = [];
    this.configPending = false;
    this.error = '';
    this.cleanup = '';
    this.uiBytes = 0;
    this.title = '';
    this.history = null;
    this.loading = false;
    this.recent = null;
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
    this.file = null;
    this.attachments = [];
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
