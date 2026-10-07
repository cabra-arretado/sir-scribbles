import { renderMarkdown, settleStreaming } from './markdown.js';
import { MASCOT_URL } from './mascot.js';
import { ICON_URL } from './icon.js';

const DECISIONS = { allow_once: 'Allow once', reject_once: 'Deny once', allow_always: 'Always allow', reject_always: 'Always deny' };

const STATES = {
  'not-started': 'Not started', starting: 'Starting', connected: 'Choose a chat', ready: 'Ready', working: 'Working',
  'waiting-for-approval': 'Waiting for approval', stopping: 'Stopping', failed: 'Failed', terminated: 'Terminated',
};

// DOM rendering only. Bot Markdown uses a restricted token renderer; note and
// tool content stays plain text. No raw HTML or automatic resource loading.
export class ChatPanel {
  constructor(container, controller, { getPath, savePath, attachSelection, attachFile, confirmReset, copyText, openNote, setIcon }) {
    this.container = container;
    this.model = controller;
    this.actions = { getPath, savePath, attachSelection, attachFile, confirmReset, copyText, openNote, setIcon };
    this.document = container.ownerDocument;
    this.rows = new Map();
    this.timer = null;
    this.disposed = false;
    this.lastCard = null;
    this.lastQueued = -1;
    this.lastSelection = undefined;
    this.lastPath = null;
    this.lastModel = null;
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
        if ((this.model.messages.length || this.model.draft || this.model.selection || this.model.file) && !(await this.actions.confirmReset())) return;
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
    this.startArea = this.el('section', 'sir-scribbles-start-area');
    this.startArea.append(this.el('h4', '', 'Connect your local agent'));
    this.path = this.el('input', 'sir-scribbles-path');
    this.path.type = 'text';
    this.path.placeholder = '/absolute/path/to/agent';
    this.path.setAttribute('aria-label', 'Agent executable path');
    this.path.spellcheck = false;
    this.path.value = this.actions.getPath();
    this.start = this.button('Start agent', () => this.launch('start'), 'mod-cta sir-scribbles-primary');
    this.browse = this.button('Open a past chat', () => this.launch('browse'), 'sir-scribbles-secondary');
    const launchRow = this.el('div', 'sir-scribbles-launch');
    launchRow.append(this.start, this.browse);
    this.startArea.append(this.path,
      this.el('p', 'sir-scribbles-caption', 'The agent uses its existing permissions and project configuration. Starting it may initialize configured hooks or MCP servers.'),
      launchRow);
    this.pathHelp = this.el('p', 'sir-scribbles-caption', 'Executable saved. Send your first prompt to start the agent, or use Start agent. Change the path in Settings → Community plugins → Sir Scribbles.');
    this.startArea.append(this.pathHelp);
    this.empty.append(this.startArea,
      this.el('p', 'sir-scribbles-footnote', 'The agent may run actions already allowed by its own configuration without asking here. The vault directory is context, not a sandbox.'),
      this.el('p', 'sir-scribbles-footnote', 'Developer preview · Kiro CLI (V3) is currently the only supported agent'));
    this.historyArea = this.el('section', 'sir-scribbles-history');
    this.historyArea.setAttribute('aria-label', 'Past chats');
    this.transcript.append(this.historyArea, this.empty);
    this.container.append(this.transcript);

    this.permissionArea = this.el('section', 'sir-scribbles-permission-area');
    this.permissionArea.setAttribute('aria-label', 'Action requiring permission');
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
    const toolbar = this.el('div', 'sir-scribbles-composer-toolbar');
    this.attach = this.iconButton('quote', 'Attach selection', async () => {
      await this.attachContext('attachSelection', 'SELECT_TEXT_FIRST');
    }, 'sir-scribbles-attach');
    this.attachFile = this.iconButton('file-text', 'Attach current note', async () => {
      if (this.model.file) { this.model.removeFile(); return; }
      await this.attachContext('attachFile', 'OPEN_NOTE_FIRST');
    }, 'sir-scribbles-attach');
    // Obsidian styles a plain select with its own "dropdown" class.
    this.modelPicker = this.el('select', 'dropdown sir-scribbles-model');
    this.modelPicker.setAttribute('aria-label', 'Model');
    this.modelPicker.addEventListener('change', () => { void this.model.setModel(this.modelPicker.value); });
    this.force = this.button('Force stop agent', () => { void this.model.forceStop(); }, 'sir-scribbles-danger');
    this.send = this.button('', () => { void this.model.send(this.actions.getPath().trim()); }, 'mod-cta sir-scribbles-send');
    this.setIcon(this.send, 'arrow-up', 'Send');
    this.stop = this.button('', () => this.model.stop(), 'sir-scribbles-send sir-scribbles-stop');
    this.setIcon(this.stop, 'square', 'Stop');
    toolbar.append(this.attach, this.attachFile, this.modelPicker, this.force, this.stop, this.send);
    composer.append(this.selectionArea, this.composer, toolbar);
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
      await this.model[method](executable);
    } catch {
      if (!this.disposed && generation === this.model.generation) this.model.setError('EXECUTABLE_NOT_AVAILABLE');
    } finally {
      this.startPending = false;
      if (!this.disposed) this.render();
    }
  }

  fitComposer() {
    // Grow with the draft up to the CSS max-height, then scroll.
    this.composer.style.height = 'auto';
    if (this.composer.scrollHeight) this.composer.style.height = `${this.composer.scrollHeight}px`;
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

  schedule() {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(() => { this.timer = null; if (!this.disposed) this.render(); }, 40);
  }
  renderControls() {
    const model = this.model;
    const canStart = (model.state === 'not-started' && Boolean(this.actions.getPath().trim())) || model.state === 'connected';
    this.send.disabled = !(model.state === 'ready' || canStart) || model.resetting || model.disposed || model.configPending ||
      Boolean(model.history?.pending) || !(model.draft.trim() || model.selection || model.file);
    this.send.title = canStart ? 'Start a new chat and send (Enter)' : 'Send (Enter)';
    this.start.disabled = model.state !== 'not-started' || model.resetting || this.startPending;
    this.browse.disabled = this.start.disabled;
    this.path.disabled = model.state !== 'not-started' || model.resetting;
    this.path.hidden = Boolean(this.actions.getPath().trim());
    this.pathHelp.hidden = !this.path.hidden;
    if (this.reset) this.reset.disabled = model.resetting || model.disposed;
    this.attach.disabled = model.resetting || model.disposed;
    this.attachFile.disabled = model.resetting || model.disposed;
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
    this.empty.hidden = model.messages.length > 0 || model.state === 'connected' || model.loading;
    if (this.composer.value !== model.draft) { this.composer.value = model.draft; this.fitComposer(); }
    this.renderControls();
    this.renderMessages();
    this.renderSelection();
    this.renderPermission();
    this.renderModel();
    this.renderHistory();
  }

  // Past chats for this vault, shown after the agent starts for browsing.
  renderHistory() {
    const model = this.model;
    const history = model.state === 'connected' && !model.loading ? model.history : null;
    if (history === this.lastHistory) return;
    this.lastHistory = history;
    this.historyArea.replaceChildren();
    this.historyArea.hidden = !history;
    if (!history) return;
    this.historyArea.append(this.el('h4', '', 'Past chats in this vault'));
    if (history.pending) this.historyArea.append(this.el('p', 'sir-scribbles-caption', 'Asking the agent for past chats…'));
    else if (history.error) this.historyArea.append(this.el('p', 'sir-scribbles-caption', history.error));
    else if (!history.entries.length) this.historyArea.append(this.el('p', 'sir-scribbles-caption', 'No past chats for this vault yet.'));
    else {
      const list = this.el('ul', 'sir-scribbles-history-list');
      for (const entry of history.entries) {
        const item = this.el('li');
        const title = entry.title || 'Untitled chat';
        const button = this.button('', () => { void model.open(entry.sessionId, entry.title); }, 'sir-scribbles-history-item');
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
    const fresh = this.button('Start a new chat', () => { void model.open(); }, 'sir-scribbles-secondary');
    fresh.disabled = Boolean(history.pending);
    this.historyArea.append(fresh);
  }

  // Agents replace the whole option list on every change, so a new object
  // means new choices; the current value is synced on every render.
  renderModel() {
    const option = this.model.modelOption();
    this.modelPicker.hidden = !option;
    if (!option) { this.lastModel = null; return; }
    if (option !== this.lastModel) {
      this.lastModel = option;
      const groups = new Map();
      this.modelPicker.replaceChildren();
      for (const value of option.options) {
        const item = this.el('option', '', value.name);
        item.value = value.value;
        if (value.description) item.title = value.description;
        let parent = this.modelPicker;
        if (value.group) {
          parent = groups.get(value.group);
          if (!parent) {
            parent = this.el('optgroup');
            parent.label = value.group;
            groups.set(value.group, parent);
            this.modelPicker.append(parent);
          }
        }
        parent.append(item);
      }
    }
    const current = option.options.find(value => value.value === option.currentValue);
    this.modelPicker.value = option.currentValue;
    this.modelPicker.title = [option.name, current?.description].filter(Boolean).join(' · ');
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
          timestamp.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          timestamp.title = date.toLocaleString();
          meta.append(timestamp);
        }
        meta.append(this.iconButton('copy', 'Copy', async () => {
          try { await this.actions.copyText(message.text); }
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
      if (row.summary) row.summary.textContent = `${typeof message.data.title === 'string' ? message.data.title : 'Tool'} · ${typeof message.data.status === 'string' ? message.data.status : 'pending'}`;
      if (message.role === 'agent') this.updateReply(row, message);
      else if (message.text !== row.rendered) { row.body.textContent = message.text; row.rendered = message.text; }
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
    if (!this.animate || !this.initialized || this.model.loading) { row.shown = message.text.length; this.paintReply(row); return; }
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
    renderMarkdown(row.body, visible, {
      sourcePath: row.message.sourcePath,
      openNote: this.actions.openNote ? async (...args) => {
        try { if (!this.disposed) await this.actions.openNote(...args); }
        catch { if (!this.disposed) { this.model.error = 'Could not open that note in this vault.'; this.model.changed(); } }
      } : undefined,
    });
    row.rendered = visible;
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

  renderPermission() {
    const card = this.model.activePermission();
    const queued = (this.model.session?.permissions.size ?? 0) - (card ? 1 : 0);
    if (card === this.lastCard && queued === this.lastQueued) return;
    this.lastCard = card;
    this.lastQueued = queued;
    this.permissionArea.replaceChildren();
    this.permissionArea.hidden = !card;
    if (!card) return;
    this.permissionArea.append(this.el('p', 'sir-scribbles-eyebrow', queued ? `Approval needed · ${queued} more queued` : 'Approval needed'),
      this.el('h3', '', card.params.toolCall.title || `Tool ${card.params.toolCall.toolCallId}`),
      this.el('p', 'sir-scribbles-caption', `Kind: ${card.params.toolCall.kind || 'Not supplied'} · Request ${card.id}`));
    if (card.params.toolCall.rawInput == null) this.permissionArea.append(this.el('p', 'sir-scribbles-caption', 'Tool arguments were not supplied. Review the available details before deciding.'));
    if (!card.params.toolCall.locations?.length) this.permissionArea.append(this.el('p', 'sir-scribbles-caption', 'Affected paths not supplied.'));
    if (!card.params._meta?.kiro?.consent) this.permissionArea.append(this.el('p', 'sir-scribbles-caption', 'Working-directory / consent context not supplied.'));
    if (card.unrecognized?.length) this.permissionArea.append(this.el('p', 'sir-scribbles-caption',
      `Unrecognized approval metadata: ${card.unrecognized.join(', ')}. It is shown in the details below; your choice still applies once only.`));
    const details = this.el('details', 'sir-scribbles-permission-details');
    details.open = true;
    // Compact JSON preserves exact argument boundaries while avoiding a large
    // whitespace expansion for deep agent-supplied structures.
    details.append(this.el('summary', '', 'Action details'), this.el('pre', 'sir-scribbles-permission-input', JSON.stringify(card.request ? { request: card.request, resolvedToolCall: card.params.toolCall } : card.params)));
    this.permissionArea.append(details);
    if (card.rule) {
      const rule = this.el('p', 'sir-scribbles-caption sir-scribbles-rule', 'Always choices are saved by the agent as a rule for this vault only, covering exactly ');
      rule.append(this.el('code', '', `${card.rule.capability} · ${card.rule.resource}`),
        '. It stops asking for that from now on, in every chat. The agent keeps its rules outside the vault, in its own settings.');
      this.permissionArea.append(rule);
    }
    const decisions = this.el('div', 'sir-scribbles-decisions');
    for (const option of card.options) {
      // The agent's own name is kept unless it only repeats the label.
      const label = DECISIONS[option.kind];
      const button = this.button(option.name.trim().toLowerCase() === label.toLowerCase() ? label : `${label} · ${option.name}`, () => {
        for (const child of decisions.children) child.disabled = true;
        this.model.decide(card, option.optionId);
        this.renderPermission();
      }, option.kind === 'allow_once' ? 'mod-cta' : '');
      decisions.append(button);
    }
    this.permissionArea.append(decisions);
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    if (this.frame) this.document.defaultView.cancelAnimationFrame?.(this.frame);
    this.streaming.clear();
    this.model.off('change', this.listener);
    this.rows.clear();
    this.container.replaceChildren();
  }
}
