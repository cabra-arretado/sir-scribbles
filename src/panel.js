import { renderMarkdown, settleStreaming } from './markdown.js';
import { MASCOT_URL } from './mascot.js';
import { ICON_URL } from './icon.js';
import { displayPrompt, toolSubject } from './display.js';
import { ACCEPT, attachmentKind, checkAttachments, formatBytes, readAttachment } from './attachments.js';
import { OperationalError } from './limits.js';
import { describeApproval, describePath } from './approval.js';

// A card can appear, or replace one just decided, under the pointer. Its
// buttons wait this long so a double-click never approves an unread action.
const APPROVAL_DELAY_MS = 500;

let controlIds = 0;
const DECISIONS = { allow_once: 'Allow once', reject_once: 'Deny once', allow_always: 'Always allow', reject_always: 'Always deny' };

const STATES = {
  'not-started': 'Not started', starting: 'Starting', connected: 'Choose a chat', ready: 'Ready', working: 'Working',
  'waiting-for-approval': 'Waiting for approval', stopping: 'Stopping', failed: 'Failed', terminated: 'Terminated',
};

// DOM rendering only. Bot Markdown uses a restricted token renderer; note and
// tool content stays plain text. No raw HTML or automatic resource loading.
export class ChatPanel {
  constructor(container, controller, { getPath, savePath, attachSelection, attachFile, confirmReset, copyText, openNote, vaultPath, setIcon, approvalDelay = APPROVAL_DELAY_MS }) {
    this.container = container;
    this.model = controller;
    this.actions = { getPath, savePath, attachSelection, attachFile, confirmReset, copyText, openNote, vaultPath, setIcon };
    this.document = container.ownerDocument;
    this.rows = new Map();
    this.timer = null;
    this.approvalDelay = approvalDelay;
    this.armTimer = null;
    this.disposed = false;
    this.lastCard = null;
    this.lastQueued = -1;
    this.lastSelection = undefined;
    this.lastAttachments = undefined;
    this.dragDepth = 0;
    this.lastPath = null;
    this.shown = new Map(); // picker -> the option it last listed
    this.lastHistory = undefined;
    this.streaming = new Set();
    this.frame = null;
    this.lastFrame = 0;
    this.paintAfter = 0;
    this.initialized = false;
    const view = this.document.defaultView;
    // Pace streamed replies on animation frames. Without them (tests) or with
    // reduced motion, text is shown as soon as it arrives.
    this.animate = typeof view?.requestAnimationFrame === 'function'
      && !view.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.build();
    this.listener = () => this.schedule();
    controller.on('change', this.listener);
    this.render();
  }
  el(tag, className = '', text = '') {
    const node = this.document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }
  button(text, action, className = '') {
    const button = this.el('button', className, text);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
  }
  // Icons come from Obsidian's setIcon when available; the label doubles as
  // the accessible name, Obsidian's tooltip and the text fallback.
  iconButton(icon, label, action, className = '') {
    const button = this.button('', action, `clickable-icon ${className}`.trim());
    this.setIcon(button, icon, label);
    return button;
  }
  setIcon(node, icon, label) {
    node.setAttribute('aria-label', label);
    if (this.actions.setIcon) { node.replaceChildren(); this.actions.setIcon(node, icon); }
    else node.textContent = label;
  }
  // Obsidian shows any aria-label as a tooltip. Areas and plain controls whose
  // purpose is obvious are named by hidden text instead, so hovering them shows
  // nothing; a visually hidden <label> names a form control.
  labelFor(control, text) {
    control.id = `sir-scribbles-control-${++controlIds}`;
    const label = this.el('label', 'sir-scribbles-sr-only', text);
    label.htmlFor = control.id;
    return label;
  }
  build() {
    this.container.replaceChildren();
    this.container.classList.add('sir-scribbles');
    const header = this.el('header', 'sir-scribbles-header');
    const mascot = this.el('img', 'sir-scribbles-mark');
    mascot.src = ICON_URL;
    mascot.alt = '';
    this.status = this.el('span', 'sir-scribbles-status');
    this.status.setAttribute('role', 'status');
    this.identity = this.el('span', 'sir-scribbles-identity');
    header.append(mascot, this.status, this.identity);
    // Tabs open new chats instead; a single panel resets in place.
    if (this.actions.confirmReset) {
      this.reset = this.iconButton('plus', 'New chat', async () => {
        if ((this.model.messages.length || this.model.draft || this.model.selection || this.model.file || this.model.attachments?.length) && !(await this.actions.confirmReset())) return;
        await this.model.newChat();
      }, 'sir-scribbles-reset');
      header.append(this.reset);
    }
    this.container.append(header);

    this.error = this.el('div', 'sir-scribbles-error');
    this.error.setAttribute('role', 'alert');
    this.container.append(this.error);

    this.transcript = this.el('div', 'sir-scribbles-transcript');
    this.empty = this.el('section', 'sir-scribbles-empty');
    const emptyMascot = this.el('img', 'sir-scribbles-empty-mark');
    emptyMascot.src = MASCOT_URL;
    emptyMascot.alt = '';
    const directory = this.el('p', 'sir-scribbles-directory', this.model.cwd);
    directory.title = this.model.cwd;
    this.empty.append(emptyMascot, this.el('h3', '', 'A little room to think.'),
      this.el('p', 'sir-scribbles-lede', 'Ask about your work. Bring a selection from a note when it helps.'), directory);
    // Past chats sit under the mascot; the list scrolls on its own.
    this.historyArea = this.el('section', 'sir-scribbles-history');
    this.empty.append(this.historyArea);
    this.startArea = this.el('section', 'sir-scribbles-start-area');
    this.startArea.append(this.el('h4', '', 'Connect your local agent'));
    this.path = this.el('input', 'sir-scribbles-path');
    this.path.type = 'text';
    this.path.placeholder = '/absolute/path/to/agent';
    this.path.spellcheck = false;
    this.path.value = this.actions.getPath();
    this.start = this.button('Start agent', () => this.launch('start'), 'mod-cta sir-scribbles-primary');
    this.browse = this.button('Open a past chat', () => this.launch('browse'), 'sir-scribbles-secondary');
    const launchRow = this.el('div', 'sir-scribbles-launch');
    launchRow.append(this.start, this.browse);
    this.startArea.append(this.labelFor(this.path, 'Agent executable path'), this.path,
      this.el('p', 'sir-scribbles-caption', 'The agent uses its existing permissions and project configuration. Starting it may initialize configured hooks or MCP servers.'),
      launchRow,
      this.el('p', 'sir-scribbles-caption', 'Sending a prompt starts the agent on its default model. Start it first to pick another model or a past chat.'));
    this.pathHelp = this.el('p', 'sir-scribbles-caption', 'Executable saved. Change it in Settings → Community plugins → Sir Scribbles.');
    this.startArea.append(this.pathHelp);
    this.empty.append(this.startArea,
      this.el('p', 'sir-scribbles-footnote', 'The agent may run actions already allowed by its own configuration without asking here. The vault directory is context, not a sandbox.'),
      this.el('p', 'sir-scribbles-footnote', 'Developer preview · Kiro CLI (V3) is currently the only supported agent'));
    this.transcript.append(this.empty);
    this.container.append(this.transcript);

    this.permissionArea = this.el('section', 'sir-scribbles-permission-area');
    this.container.append(this.permissionArea);

    const footer = this.el('footer', 'sir-scribbles-footer');
    this.selectionArea = this.el('section', 'sir-scribbles-selection');
    const composer = this.el('div', 'sir-scribbles-composer');
    this.composer = this.el('textarea', 'sir-scribbles-prompt');
    this.composer.placeholder = 'What are you working on?';
    this.composer.rows = 2;
    this.composer.addEventListener('input', () => { this.model.setDraft(this.composer.value); this.fitComposer(); this.renderControls(); });
    this.composer.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        if (!event.repeat && !this.send.disabled) void this.model.send(this.actions.getPath().trim());
      }
    });
    // Files arrive by paste, drop or the picker. Plain text pastes as usual.
    this.composer.addEventListener('paste', event => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (!files.length) return;
      event.preventDefault();
      void this.addFiles(files);
    });
    this.bindDrop(composer);
    this.picker = this.el('input', 'sir-scribbles-file-input');
    this.picker.type = 'file';
    this.picker.multiple = true;
    this.picker.accept = ACCEPT;
    this.picker.hidden = true;
    this.picker.tabIndex = -1;
    this.picker.addEventListener('change', () => {
      const files = [...(this.picker.files ?? [])];
      this.picker.value = '';
      if (files.length) void this.addFiles(files);
    });
    const toolbar = this.el('div', 'sir-scribbles-composer-toolbar');
    this.attachUpload = this.iconButton('paperclip', 'Attach images or text files', () => this.picker.click(), 'sir-scribbles-attach');
    this.attach = this.iconButton('quote', 'Attach selection', async () => {
      await this.attachContext('attachSelection', 'SELECT_TEXT_FIRST');
    }, 'sir-scribbles-attach');
    this.attachFile = this.iconButton('file-text', 'Attach current note', async () => {
      if (this.model.file) { this.model.removeFile(); return; }
      await this.attachContext('attachFile', 'OPEN_NOTE_FIRST');
    }, 'sir-scribbles-attach');
    // Obsidian styles a plain select with its own "dropdown" class.
    this.modelPicker = this.el('select', 'dropdown sir-scribbles-model');
    this.modelPicker.addEventListener('change', () => { void this.model.setModel(this.modelPicker.value); });
    this.effortPicker = this.el('select', 'dropdown sir-scribbles-model sir-scribbles-effort');
    this.effortPicker.addEventListener('change', () => { void this.model.setEffort(this.effortPicker.value); });
    this.force = this.button('Force stop agent', () => { void this.model.forceStop(); }, 'sir-scribbles-danger');
    this.send = this.button('', () => { void this.model.send(this.actions.getPath().trim()); }, 'mod-cta sir-scribbles-send');
    this.setIcon(this.send, 'arrow-up', 'Send');
    this.stop = this.button('', () => this.model.stop(), 'sir-scribbles-send sir-scribbles-stop');
    this.setIcon(this.stop, 'square', 'Stop');
    toolbar.append(this.attachUpload, this.attach, this.attachFile, this.labelFor(this.modelPicker, 'Model'), this.modelPicker,
      this.labelFor(this.effortPicker, 'Effort'), this.effortPicker, this.force, this.stop, this.send);
    this.attachmentArea = this.el('section', 'sir-scribbles-attachments');
    composer.append(this.selectionArea, this.attachmentArea, this.composer, toolbar, this.picker);
    footer.append(composer);
    this.container.append(footer);
  }

  // Start a new chat, or start the agent to list past ones.
  async launch(method) {
    const saved = this.actions.getPath().trim();
    const executable = saved || this.path.value.trim();
    const generation = this.model.generation;
    this.startPending = true;
    this.renderControls();
    try {
      // Save only this setting, not any conversation state.
      if (!saved) await this.actions.savePath(executable);
      if (this.disposed || generation !== this.model.generation) return;
      if (method === 'start') await this.model.start(executable, { listPast: true });
      else await this.model[method](executable);
    } catch {
      if (!this.disposed && generation === this.model.generation) this.model.setError('EXECUTABLE_NOT_AVAILABLE');
    } finally {
      this.startPending = false;
      if (!this.disposed) this.render();
    }
  }

  fitComposer() {
    // Grow with the draft up to the CSS max-height, then scroll.
    this.composer.style.removeProperty('--sir-scribbles-prompt-height');
    if (this.composer.scrollHeight) this.composer.style.setProperty('--sir-scribbles-prompt-height', `${this.composer.scrollHeight}px`);
  }

  async attachContext(action, errorCode) {
    const generation = this.model.generation;
    try {
      const snapshot = await this.actions[action]();
      if (!this.disposed && !this.model.resetting && generation === this.model.generation) this.model.attach(snapshot);
    } catch (error) {
      if (!this.disposed && generation === this.model.generation) this.model.setError(error.code || errorCode);
    }
  }

  // Drag-and-drop from Finder or another app. Only file drags are claimed;
  // dragging text into the prompt keeps its default behavior.
  bindDrop(target) {
    const carriesFiles = event => [...(event.dataTransfer?.types ?? [])].includes('Files');
    const leave = () => { this.dragDepth = 0; target.classList.remove('is-dragover'); };
    target.addEventListener('dragenter', event => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      this.dragDepth++;
      target.classList.add('is-dragover');
    });
    target.addEventListener('dragover', event => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    target.addEventListener('dragleave', event => {
      if (!carriesFiles(event)) return;
      if (--this.dragDepth <= 0) leave();
    });
    target.addEventListener('drop', event => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      leave();
      const files = [...(event.dataTransfer.files ?? [])];
      if (files.length) void this.addFiles(files);
    });
  }

  // Refuses what it can before reading anything (type, file and image counts),
  // then reads in order and checks sizes as they become known. A refused
  // batch adds nothing to the draft and names the problem.
  async addFiles(files) {
    const model = this.model;
    const generation = model.generation;
    // Reads outlive agent starts and restarts; only clearing the composer
    // (New chat, closing the tab) drops them.
    let reading = null;
    const live = () => !this.disposed && (model.readCurrent && reading !== null ? model.readCurrent(reading) : generation === model.generation);
    try {
      const kinds = files.map(file => attachmentKind(file));
      if (kinds.includes(null)) throw new OperationalError('FILE_TYPE_UNSUPPORTED');
      checkAttachments([...model.attachments, ...kinds.map(kind => ({ kind, size: 0 }))]);
      if (kinds.includes('image') && model.supportsImages?.() === false) throw new OperationalError('IMAGES_NOT_SUPPORTED');
      reading = model.beginRead?.() ?? null;
      const items = [];
      for (const file of files) {
        items.push(await readAttachment(file));
        if (!live()) return;
        checkAttachments([...model.attachments, ...items]);
      }
      model.addAttachments(items);
    } catch (error) {
      if (live()) model.setError(error.code || 'FILE_UNREADABLE');
    } finally {
      if (reading !== null) model.endRead?.(reading);
    }
  }

  schedule() {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(() => { this.timer = null; if (!this.disposed) this.render(); }, 40);
  }
  renderControls() {
    const model = this.model;
    const canStart = (model.state === 'not-started' && Boolean(this.actions.getPath().trim())) || model.state === 'connected';
    this.send.disabled = !(model.state === 'ready' || canStart) || model.resetting || model.disposed || model.configPending ||
      Boolean(model.history?.pending) || Boolean(model.reading) || !(model.draft.trim() || model.selection || model.file || model.attachments?.length);
    this.send.title = model.reading ? 'Reading attached files…' : canStart ? 'Start a new chat and send (Enter)' : 'Send (Enter)';
    this.start.disabled = model.state !== 'not-started' || model.resetting || this.startPending;
    this.browse.disabled = this.start.disabled;
    this.path.disabled = model.state !== 'not-started' || model.resetting;
    this.path.hidden = Boolean(this.actions.getPath().trim());
    this.pathHelp.hidden = !this.path.hidden;
    if (this.reset) this.reset.disabled = model.resetting || model.disposed;
    this.attach.disabled = model.resetting || model.disposed;
    this.attachFile.disabled = model.resetting || model.disposed;
    this.attachUpload.disabled = model.resetting || model.disposed;
    this.attachFile.setAttribute('aria-pressed', String(Boolean(model.file)));
    this.attachFile.setAttribute('aria-label', model.file ? 'Remove attached note' : 'Attach current note');
    this.attachFile.classList.toggle('is-active', Boolean(model.file));
    this.attach.setAttribute('aria-pressed', String(Boolean(model.selection)));
    this.attach.setAttribute('aria-label', model.selection ? 'Replace selection with the current one' : 'Attach selection');
    this.attach.classList.toggle('is-active', Boolean(model.selection));
    this.stop.hidden = !['starting', 'working', 'waiting-for-approval', 'stopping'].includes(model.state);
    this.stop.disabled = model.state === 'stopping' || model.resetting;
    this.send.hidden = !this.stop.hidden;
    this.modelPicker.disabled = model.state !== 'ready' || model.configPending || model.resetting;
    this.effortPicker.disabled = this.modelPicker.disabled;
    this.force.hidden = !model.forceAvailable;
    this.force.disabled = model.resetting;
  }

  render() {
    const model = this.model;
    this.status.textContent = STATES[model.state] ?? model.state;
    this.status.dataset.state = model.state;
    this.status.title = model.cwd;
    this.identity.textContent = model.identity || '';
    this.error.textContent = model.error + (model.cleanup === 'observed' ? `${model.error ? '\n' : ''}Owned process cleanup observed.` : '');
    this.error.hidden = !this.error.textContent;
    const path = this.actions.getPath();
    if (this.lastPath !== path && this.document.activeElement !== this.path) this.path.value = path;
    this.lastPath = path;
    this.startArea.hidden = model.state !== 'not-started';
    this.empty.hidden = model.messages.length > 0 || model.loading;
    if (this.composer.value !== model.draft) { this.composer.value = model.draft; this.fitComposer(); }
    this.renderControls();
    this.renderMessages();
    this.renderSelection();
    this.renderAttachments();
    this.renderPermission();
    this.renderPicker(this.modelPicker, this.model.modelOption());
    this.renderPicker(this.effortPicker, this.model.effortOption());
    this.renderHistory();
  }

  // Past chats for this vault: the picker after Open a past chat, or the
  // offer in a chat started with Start agent until its first message.
  renderHistory() {
    const model = this.model;
    const offered = model.state === 'ready' && !model.messages.length && !model.loading ? model.recent : null;
    const history = model.state === 'connected' && !model.loading ? model.history : offered;
    if (history === this.lastHistory) return;
    this.lastHistory = history;
    this.historyArea.replaceChildren();
    this.historyArea.hidden = !history;
    if (!history) return;
    this.historyArea.append(this.el('h4', '', 'Past chats in this vault'));
    if (history.pending) this.historyArea.append(this.el('p', 'sir-scribbles-caption', 'Asking the agent for past chats…'));
    else if (history.error) {
      this.historyArea.append(this.el('p', 'sir-scribbles-caption', history.error));
      if (history.retry) this.historyArea.append(this.button('Try again', () => { void model.browse(); }, 'sir-scribbles-secondary'));
    }
    else if (!history.entries.length) this.historyArea.append(this.el('p', 'sir-scribbles-caption', 'No past chats for this vault yet.'));
    else {
      const list = this.el('ul', 'sir-scribbles-history-list');
      for (const entry of history.entries) {
        const item = this.el('li');
        const title = entry.title || 'Untitled chat';
        const button = this.button('', () => {
          if (offered) void model.reopen(this.actions.getPath().trim(), entry.sessionId, entry.title);
          else void model.open(entry.sessionId, entry.title);
        }, 'sir-scribbles-history-item');
        button.append(this.el('span', 'sir-scribbles-history-title', title));
        if (entry.updatedAt !== null) {
          const date = new Date(entry.updatedAt);
          const time = this.el('time', 'sir-scribbles-history-date', date.toLocaleDateString([], { month: 'short', day: 'numeric' }));
          time.dateTime = date.toISOString();
          time.title = date.toLocaleString();
          button.append(time);
        }
        button.title = title;
        item.append(button);
        list.append(item);
      }
      this.historyArea.append(list);
    }
    if (offered) return; // Already in a new chat.
    const fresh = this.button('Start a new chat', () => { void model.open(); }, 'sir-scribbles-secondary');
    fresh.disabled = Boolean(history.pending);
    this.historyArea.append(fresh);
  }

  // Agents replace the whole option list on every change, so a new object
  // means new choices; the current value is synced on every render.
  renderPicker(picker, option) {
    picker.hidden = !option;
    if (!option) { this.shown.delete(picker); return; }
    if (option !== this.shown.get(picker)) {
      this.shown.set(picker, option);
      const groups = new Map();
      picker.replaceChildren();
      for (const value of option.options) {
        const item = this.el('option', '', value.name);
        item.value = value.value;
        if (value.description) item.title = value.description;
        let parent = picker;
        if (value.group) {
          parent = groups.get(value.group);
          if (!parent) {
            parent = this.el('optgroup');
            parent.label = value.group;
            groups.set(value.group, parent);
            picker.append(parent);
          }
        }
        parent.append(item);
      }
    }
    const current = option.options.find(value => value.value === option.currentValue);
    picker.value = option.currentValue;
    picker.title = [option.name, current?.description].filter(Boolean).join(' · ');
  }

  renderMessages() {
    const nearBottom = this.transcript.scrollHeight - this.transcript.scrollTop - this.transcript.clientHeight < 80;
    const existing = new Set(this.model.messages);
    for (const [message, row] of this.rows) {
      if (!existing.has(message)) { row.root.remove(); this.rows.delete(message); this.streaming.delete(row); }
    }
    if (this.frame && !this.streaming.size) {
      this.document.defaultView.cancelAnimationFrame?.(this.frame);
      this.frame = null;
      this.lastFrame = 0;
    }
    for (const message of this.model.messages) {
      let row = this.rows.get(message);
      if (!row) {
        const root = this.el('article', `sir-scribbles-message sir-scribbles-${message.role}`);
        const meta = this.el('div', 'sir-scribbles-message-meta');
        const label = this.el('span', 'sir-scribbles-sr-only', message.role === 'user' ? 'You' : message.role === 'tool' ? 'Tool activity' : 'Agent');
        // Replayed history carries no local time; show none rather than a wrong one.
        if (message.timestamp !== null) {
          const timestamp = this.el('time', 'sir-scribbles-timestamp');
          const date = new Date(message.timestamp ?? Date.now());
          timestamp.dateTime = date.toISOString();
          timestamp.title = date.toLocaleString();
          timestamp.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          meta.append(timestamp);
        }
        meta.append(this.iconButton('copy', 'Copy', async () => {
          try { await this.actions.copyText(message.role === 'user' ? displayPrompt(message.text) : message.text); }
          catch { this.model.error = 'Could not copy. Select the text and copy it manually.'; this.model.changed(); }
        }, 'sir-scribbles-copy'));
        let body;
        if (message.role === 'tool') {
          const details = this.el('details', 'sir-scribbles-tool-details');
          body = this.el('pre', 'sir-scribbles-plain-text');
          const summary = this.el('summary');
          details.append(summary, body);
          root.append(label, details, meta);
          row = { root, body, summary, label, rendered: '' };
        } else {
          body = this.el('div', message.role === 'agent' ? 'sir-scribbles-markdown' : 'sir-scribbles-plain-text');
          root.append(label, body, meta);
          row = { root, body, label, rendered: '' };
        }
        this.rows.set(message, row);
        this.transcript.append(root);
      }
      if (row.summary) {
        const title = typeof message.data.title === 'string' ? message.data.title : 'Tool';
        // A title like "Searching the web for: <query>" already ends with it.
        const subject = toolSubject(message.data);
        const shown = subject && !title.endsWith(`: ${subject.replace(/^“|”$/g, '')}`) ? `${title}: ${subject}` : title;
        row.summary.textContent = `${shown} · ${typeof message.data.status === 'string' ? message.data.status : 'pending'}`;
      }
      if (message.role === 'agent') this.updateReply(row, message);
      else if (message.text !== row.rendered || message.attachments !== row.attachments) {
        // Files sent from here show as chips, so their text stays out of the
        // bubble. A replayed turn only has image chips; its text shows in full.
        const chips = message.attachments?.some(item => item.kind === 'text');
        row.body.textContent = message.role === 'user' ? displayPrompt(message.text, { files: !chips }) : message.text;
        row.body.hidden = message.role === 'user' && !row.body.textContent;
        row.rendered = message.text;
        if (message.attachments !== row.attachments) {
          row.files?.remove();
          row.files = message.attachments?.length ? this.attachmentList(message.attachments) : null;
          if (row.files) row.body.after(row.files);
          row.attachments = message.attachments;
        }
      }
    }
    const last = this.model.messages.at(-1);
    for (const [message, row] of this.rows) {
      if (message.role === 'agent') row.root.classList.toggle('is-streaming', this.streaming.has(row) || (message === last && this.model.state === 'working'));
    }
    this.initialized = true;
    if (nearBottom) this.transcript.scrollTop = this.transcript.scrollHeight;
  }

  // Streamed text arrives in uneven bursts. Reveal it at a pace that follows
  // the backlog: steady for small chunks, catching up quickly on large ones.
  updateReply(row, message) {
    // Unchanged text may still need a repaint when the reply finishes.
    if (row.target === message.text) { if (!this.streaming.has(row)) this.paintReply(row); return; }
    if (!message.text.startsWith(row.target ?? '')) row.shown = 0;
    row.target = message.text;
    row.message = message;
    // Rows that exist when the panel opens, or arrive while a past chat is
    // replayed, are history, not a stream.
    // Replayed messages carry no local time; that marks them even when the
    // replay finished before this render.
    if (!this.animate || !this.initialized || this.model.loading || message.timestamp === null) { row.shown = message.text.length; this.paintReply(row); return; }
    row.shown ??= 0;
    this.streaming.add(row);
    this.requestFrame();
  }
  paintReply(row) {
    const text = row.message.text;
    // Catching up with the received text does not mean the reply is complete:
    // keep unfinished syntax settled until the agent stops writing.
    const writing = row.message === this.model.messages.at(-1) && this.model.state === 'working';
    const visible = row.shown >= text.length && !writing ? text : settleStreaming(text.slice(0, row.shown));
    if (visible === row.rendered) return;
    const truncated = renderMarkdown(row.body, visible, {
      pages: row.pages ?? 1,
      sourcePath: row.message.sourcePath,
      vaultPath: this.actions.vaultPath,
      openNote: this.actions.openNote ? async (...args) => {
        try { if (!this.disposed) await this.actions.openNote(...args); }
        catch { if (!this.disposed) { this.model.error = 'Could not open that note in this vault.'; this.model.changed(); } }
      } : undefined,
    });
    row.rendered = visible;
    // A very long reply renders a page at a time; Copy keeps the full text.
    if (truncated && !row.more) {
      row.more = this.button('Show more', () => {
        row.pages = (row.pages ?? 1) + 1;
        row.rendered = null;
        this.paintReply(row);
      }, 'sir-scribbles-more');
      row.more.title = 'Part of this long reply is not shown yet. Copy includes all of it.';
      row.body.after(row.more);
    }
    if (row.more) row.more.hidden = !truncated;
  }
  requestFrame() {
    if (this.frame || this.disposed || !this.streaming.size) return;
    this.frame = this.document.defaultView.requestAnimationFrame(now => {
      this.frame = null;
      if (this.disposed) return;
      const elapsed = Math.min(now - (this.lastFrame || now - 16), 250);
      // Ease toward the received text: about 63% of the backlog per 250 ms
      // while the agent is writing, per 80 ms once it is done, and never
      // slower than ~80 characters a second.
      const settle = this.model.state === 'working' ? 250 : 80;
      // Each paint re-parses the visible reply, so cost grows with its length
      // (~2 ms at 10k characters, ~17 ms at 100k). Skip frames after a costly
      // paint to keep rendering under about a fifth of the time.
      if (now < this.paintAfter) { this.requestFrame(); return; }
      const pinned = this.transcript.scrollHeight - this.transcript.scrollTop - this.transcript.clientHeight < 80;
      const started = performance.now();
      for (const row of this.streaming) {
        const total = row.message.text.length;
        const backlog = total - row.shown;
        row.shown = Math.min(total, row.shown + Math.max(Math.ceil(elapsed * 0.08), Math.ceil(backlog * (1 - Math.exp(-elapsed / settle)))));
        this.paintReply(row);
        if (row.shown >= total) {
          this.streaming.delete(row);
          row.root.classList.toggle('is-streaming', row.message === this.model.messages.at(-1) && this.model.state === 'working');
        }
      }
      this.paintAfter = now + (performance.now() - started) * 4;
      this.lastFrame = now;
      if (pinned) this.transcript.scrollTop = this.transcript.scrollHeight;
      if (this.streaming.size) this.requestFrame();
      else this.lastFrame = 0;
    });
  }

  renderSelection() {
    const selection = this.model.selection;
    const file = this.model.file;
    if (selection === this.lastSelection && file === this.lastFile) return;
    this.lastFile = file;
    this.lastSelection = selection;
    this.selectionArea.replaceChildren();
    this.selectionArea.hidden = !selection && !file;
    if (file) {
      const fileCard = this.el('div', 'sir-scribbles-context-card');
      const fileRow = this.el('div', 'sir-scribbles-selection-header');
      const path = this.el('span', 'sir-scribbles-context-path', file.path);
      path.title = `${file.path} · path only`;
      fileRow.append(this.el('span', 'sir-scribbles-context-label', 'Note'), path,
        this.iconButton('x', 'Remove file', () => this.model.removeFile(), 'sir-scribbles-context-remove'));
      fileCard.append(fileRow);
      this.selectionArea.append(fileCard);
    }
    if (!selection) return;
    const selectionCard = this.el('div', 'sir-scribbles-context-card');
    const details = this.el('details');
    details.open = false;
    const summary = this.el('summary', 'sir-scribbles-selection-header');
    const path = this.el('span', 'sir-scribbles-context-path', `${selection.path}:${selection.from}–${selection.to}`);
    path.title = `${selection.path} · lines ${selection.from}–${selection.to} · click to preview`;
    summary.append(this.el('span', 'sir-scribbles-context-label', 'Selection'), path,
      this.iconButton('x', 'Remove selection', event => { event.preventDefault(); this.model.removeSelection(); }, 'sir-scribbles-context-remove'));
    details.append(summary, this.el('pre', 'sir-scribbles-selection-text', selection.text));
    selectionCard.append(details);
    this.selectionArea.append(selectionCard);
  }

  // Chips for files in the draft, each removable.
  renderAttachments() {
    const attachments = this.model.attachments ?? [];
    const reading = Boolean(this.model.reading);
    if (attachments === this.lastAttachments && reading === this.lastReading) return;
    this.lastAttachments = attachments;
    this.lastReading = reading;
    this.attachmentArea.replaceChildren();
    this.attachmentArea.hidden = !attachments.length && !reading;
    const list = this.attachmentList(attachments, item => this.model.removeAttachment(item));
    if (reading) {
      const pending = this.el('li', 'sir-scribbles-attachment is-image is-pending');
      pending.append(this.el('span', 'sir-scribbles-sr-only', 'Reading attached files'));
      list.append(pending);
    }
    this.attachmentArea.append(list);
  }

  // Images show only a thumbnail drawn locally from the file, with the name
  // as its tooltip; text files show an icon, name and size.
  attachmentList(attachments, remove = null) {
    const list = this.el('ul', 'sir-scribbles-attachment-list');
    for (const item of attachments) {
      const chip = this.el('li', `sir-scribbles-attachment is-${item.kind}`);
      chip.title = `${item.name} · ${formatBytes(item.size)}`;
      if (item.kind === 'image' && item.preview) {
        const thumb = this.el('img', 'sir-scribbles-attachment-thumb');
        thumb.src = item.preview;
        thumb.alt = item.name;
        chip.append(thumb);
      } else {
        const icon = this.el('span', 'sir-scribbles-attachment-icon');
        if (this.actions.setIcon) this.actions.setIcon(icon, item.kind === 'image' ? 'image' : 'file-text');
        if (item.kind === 'image') icon.append(this.el('span', 'sir-scribbles-sr-only', item.name));
        chip.append(icon);
      }
      if (item.kind === 'text') {
        const text = this.el('span', 'sir-scribbles-attachment-text');
        text.append(this.el('span', 'sir-scribbles-attachment-name', item.name), this.el('span', 'sir-scribbles-attachment-size', formatBytes(item.size)));
        chip.append(text);
      }
      if (remove) chip.append(this.iconButton('x', `Remove ${item.name}`, () => remove(item), 'sir-scribbles-attachment-remove'));
      list.append(chip);
    }
    return list;
  }

  renderPermission() {
    const card = this.model.activePermission();
    const queued = (this.model.session?.permissions.size ?? 0) - (card ? 1 : 0);
    if (card === this.lastCard && queued === this.lastQueued) return;
    this.lastCard = card;
    this.lastQueued = queued;
    clearTimeout(this.armTimer);
    this.permissionArea.replaceChildren();
    this.permissionArea.hidden = !card;
    if (!card) return;
    const toolCall = card.params.toolCall;
    const action = describeApproval(toolCall, this.model.cwd);
    const identity = this.model.session?.identity;
    const agent = (typeof identity?.title === 'string' && identity.title.trim()) || 'The agent';

    const eyebrow = this.el('p', 'sir-scribbles-eyebrow', 'Approval needed');
    if (queued) eyebrow.append(this.el('span', 'sir-scribbles-queued', `${queued} more waiting`));
    const header = this.el('div', 'sir-scribbles-approval-header');
    const icon = this.el('span', 'sir-scribbles-approval-icon');
    if (this.actions.setIcon) this.actions.setIcon(icon, action.icon);
    const heading = this.el('div', 'sir-scribbles-approval-heading');
    heading.append(this.el('h3', '', action.heading), this.el('p', 'sir-scribbles-approval-sentence', `${agent} ${action.sentence}`));
    if (action.detail) heading.append(this.el('p', 'sir-scribbles-approval-detail', action.detail));
    header.append(icon, heading);
    this.permissionArea.append(eyebrow, header);

    if (action.paths.length) {
      const list = this.el('ul', 'sir-scribbles-approval-paths');
      for (const path of action.paths) {
        const item = this.el('li', path.outside ? 'is-outside' : '');
        item.append(this.el('code', '', path.label));
        if (path.outside) item.append(this.el('span', 'sir-scribbles-approval-badge', 'Outside vault'));
        list.append(item);
      }
      this.permissionArea.append(list);
    }
    for (const block of action.previews) {
      const section = this.el('div', 'sir-scribbles-approval-preview');
      const lines = block.lines > 1 ? ` · ${block.lines} lines` : '';
      section.append(this.el('p', 'sir-scribbles-approval-label', `${block.label}${lines}`),
        this.el('pre', 'sir-scribbles-approval-code', block.text));
      if (block.truncated) section.append(this.el('p', 'sir-scribbles-caption', 'Shortened here. The full text is in Technical details.'));
      this.permissionArea.append(section);
    }
    if (action.cwd) this.permissionArea.append(this.el('p', 'sir-scribbles-caption', `Runs in ${action.cwd.label}`));
    if (action.vague) this.permissionArea.append(this.el('p', 'sir-scribbles-approval-warning', 'The agent did not say exactly what this will do. Check Technical details before allowing it.'));
    if (card.unrecognized?.length) this.permissionArea.append(this.el('p', 'sir-scribbles-caption',
      `This request has details Sir Scribbles does not recognize (${card.unrecognized.join(', ')}), so only one-time choices are offered.`));

    // One-time choices first; saved rules on a quieter row with what they cover.
    const decisions = this.el('div', 'sir-scribbles-decisions');
    const once = card.options.filter(option => !option.kind.endsWith('_always'));
    const always = card.options.filter(option => option.kind.endsWith('_always'));
    const counts = new Map();
    for (const option of card.options) counts.set(option.kind, (counts.get(option.kind) ?? 0) + 1);
    const labelOf = option => {
      const base = option.kind === 'allow_once' ? (always.length ? 'Allow once' : 'Allow')
        : option.kind === 'reject_once' ? (always.length ? 'Deny once' : 'Deny') : DECISIONS[option.kind];
      // Several choices of one kind are told apart by the agent's own names.
      return counts.get(option.kind) > 1 ? `${base} · ${option.name}` : base;
    };
    const row = (options, className) => {
      const container = this.el('div', `sir-scribbles-decision-row ${className}`);
      for (const option of options) {
        const button = this.button(labelOf(option), () => {
          for (const child of decisions.querySelectorAll('button')) child.disabled = true;
          this.model.decide(card, option.optionId);
          this.renderPermission();
        }, option.kind === 'allow_once' ? 'mod-cta' : '');
        button.disabled = this.approvalDelay > 0;
        container.append(button);
      }
      return container;
    };
    decisions.append(row(once, 'is-once'));
    if (always.length) {
      decisions.append(row(always, 'is-always'));
      if (card.rule) {
        // Name what the rule covers unless it is the path shown above.
        const covered = describePath(card.rule.resource, this.model.cwd).label;
        const rule = this.el('p', 'sir-scribbles-caption sir-scribbles-rule');
        if (action.paths.length === 1 && action.paths[0].label === covered) rule.append('Always remembers this choice for this file in every chat in this vault.');
        else rule.append('Always remembers this choice for ', this.el('code', '', covered), ' in every chat in this vault. For a folder, that includes everything inside it.');
        decisions.append(rule);
      }
    }
    const details = this.el('details', 'sir-scribbles-permission-details');
    // Compact JSON preserves exact argument boundaries while avoiding a large
    // whitespace expansion for deep agent-supplied structures.
    details.append(this.el('summary', '', 'Technical details'), this.el('pre', 'sir-scribbles-permission-input', JSON.stringify(card.request ? { request: card.request, resolvedToolCall: toolCall } : card.params)));
    this.permissionArea.append(details);
    this.permissionArea.append(decisions);
    if (this.approvalDelay > 0) this.armTimer = setTimeout(() => {
      for (const child of decisions.querySelectorAll('button')) child.disabled = false;
    }, this.approvalDelay);
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    clearTimeout(this.armTimer);
    if (this.frame) this.document.defaultView.cancelAnimationFrame?.(this.frame);
    this.streaming.clear();
    this.model.off('change', this.listener);
    this.rows.clear();
    this.container.replaceChildren();
  }
}
