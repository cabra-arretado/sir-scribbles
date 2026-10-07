import { renderMarkdown } from './markdown.js';
import { MASCOT_URL } from './mascot.js';
import { ICON_URL } from './icon.js';

const STATES = {
  'not-started': 'Not started', starting: 'Starting', ready: 'Ready', working: 'Working',
  'waiting-for-approval': 'Waiting for approval', stopping: 'Stopping', failed: 'Failed', terminated: 'Terminated',
};

// DOM rendering only. Bot Markdown uses a restricted token renderer; note and
// tool content stays plain text. No raw HTML or automatic resource loading.
export class ChatPanel {
  constructor(container, controller, { getPath, savePath, attachSelection, attachFile, confirmReset, copyText, openNote }) {
    this.container = container;
    this.model = controller;
    this.actions = { getPath, savePath, attachSelection, attachFile, confirmReset, copyText, openNote };
    this.document = container.ownerDocument;
    this.rows = new Map();
    this.timer = null;
    this.disposed = false;
    this.lastCard = null;
    this.lastQueued = -1;
    this.lastSelection = undefined;
    this.lastPath = null;
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
  build() {
    this.container.replaceChildren();
    this.container.classList.add('sir-scribbles');
    const header = this.el('header', 'sir-scribbles-header');
    const title = this.el('div', 'sir-scribbles-title-row');
    const mascot = this.el('img', 'sir-scribbles-mark');
    mascot.src = ICON_URL;
    mascot.alt = '';
    title.append(mascot, this.el('h2', '', 'Sir Scribbles'));
    this.status = this.el('span', 'sir-scribbles-status');
    this.status.setAttribute('role', 'status');
    title.append(this.status);
    this.directory = this.el('p', 'sir-scribbles-directory', this.model.cwd);
    this.directory.title = this.model.cwd;
    this.identity = this.el('p', 'sir-scribbles-identity');
    this.reset = this.button('New chat', async () => {
      if ((this.model.messages.length || this.model.draft || this.model.selection || this.model.file) && !(await this.actions.confirmReset())) return;
      await this.model.newChat();
    }, 'sir-scribbles-reset');
    header.append(title, this.directory, this.identity, this.reset);
    this.container.append(header);

    this.error = this.el('div', 'sir-scribbles-error');
    this.error.setAttribute('role', 'alert');
    this.container.append(this.error);

    this.transcript = this.el('div', 'sir-scribbles-transcript');
    this.empty = this.el('section', 'sir-scribbles-empty');
    const emptyMascot = this.el('img', 'sir-scribbles-empty-mark');
    emptyMascot.src = MASCOT_URL;
    emptyMascot.alt = '';
    this.empty.append(emptyMascot, this.el('h3', '', 'A little room to think.'),
      this.el('p', '', 'Ask about your work. Bring a selection from a note when it helps.'));
    this.startArea = this.el('section', 'sir-scribbles-start-area');
    this.startArea.append(this.el('h4', '', 'Connect your local Kiro'));
    this.path = this.el('input', 'sir-scribbles-path');
    this.path.type = 'text';
    this.path.placeholder = '/absolute/path/to/kiro-cli';
    this.path.setAttribute('aria-label', 'Kiro executable path');
    this.path.spellcheck = false;
    this.path.value = this.actions.getPath();
    this.start = this.button('Start Kiro', async () => {
      const saved = this.actions.getPath().trim();
      const executable = saved || this.path.value.trim();
      const generation = this.model.generation;
      this.startPending = true;
      this.start.disabled = true;
      try {
        // Save only this setting, not any conversation state.
        if (!saved) await this.actions.savePath(executable);
        if (this.disposed || generation !== this.model.generation) return;
        await this.model.start(executable);
      } catch {
        if (!this.disposed && generation === this.model.generation) this.model.setError('EXECUTABLE_NOT_AVAILABLE');
      } finally {
        this.startPending = false;
        if (!this.disposed) this.render();
      }
    }, 'mod-cta sir-scribbles-primary');
    this.startArea.append(this.path,
      this.el('p', 'sir-scribbles-caption', 'Kiro uses its existing permissions and project configuration. Starting it may initialize configured hooks or MCP servers.'),
      this.start);
    this.pathHelp = this.el('p', 'sir-scribbles-caption', 'Executable saved. Send your first prompt to start Kiro, or use Start Kiro. Change the path in Settings → Community plugins → Sir Scribbles.');
    this.startArea.append(this.pathHelp);
    this.empty.append(this.startArea, this.el('p', 'sir-scribbles-preview-label', 'Developer preview · Kiro V3 compatibility is unverified'));
    this.transcript.append(this.empty);
    this.container.append(this.transcript);

    this.permissionArea = this.el('section', 'sir-scribbles-permission-area');
    this.permissionArea.setAttribute('aria-label', 'Action requiring permission');
    this.container.append(this.permissionArea);

    const footer = this.el('footer', 'sir-scribbles-footer');
    this.selectionArea = this.el('section', 'sir-scribbles-selection');
    const composer = this.el('div', 'sir-scribbles-composer');
    this.composer = this.el('textarea', 'sir-scribbles-prompt');
    this.composer.placeholder = 'What are you working on?';
    this.composer.rows = 4;
    this.composer.addEventListener('input', () => { this.model.setDraft(this.composer.value); this.renderControls(); });
    this.composer.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        if (!event.repeat && !this.send.disabled) void this.model.send(this.actions.getPath().trim());
      }
    });
    const toolbar = this.el('div', 'sir-scribbles-composer-toolbar');
    const attachments = this.el('div', 'sir-scribbles-attachment-toolbar');
    this.attach = this.button('+ Selection', async () => {
      await this.attachContext('attachSelection', 'SELECT_TEXT_FIRST');
    }, 'sir-scribbles-attach');
    this.attach.title = 'Attach selected text from the current note';
    this.attachFile = this.button('+ File', async () => {
      if (this.model.file) { this.model.removeFile(); return; }
      await this.attachContext('attachFile', 'OPEN_NOTE_FIRST');
    }, 'sir-scribbles-attach');
    this.attachFile.title = 'Attach the current note path; Kiro can read the saved file';
    this.send = this.button('Send ↑', () => { void this.model.send(this.actions.getPath().trim()); }, 'mod-cta sir-scribbles-primary');
    attachments.append(this.attach, this.attachFile);
    toolbar.append(this.send);
    composer.append(attachments, this.selectionArea, this.composer, toolbar);
    footer.append(composer);
    const controls = this.el('div', 'sir-scribbles-session-controls');
    this.stop = this.button('Stop', () => this.model.stop());
    this.force = this.button('Force stop Kiro', () => { void this.model.forceStop(); }, 'sir-scribbles-danger');
    this.shortcut = this.el('span', 'sir-scribbles-caption', 'Enter to send · Shift + Enter for a newline');
    controls.append(this.stop, this.force, this.shortcut);
    footer.append(controls, this.el('p', 'sir-scribbles-boundary', 'Kiro may run actions already allowed by its own configuration without asking here. The vault directory is context, not a sandbox.'));
    this.container.append(footer);
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
    const canStart = model.state === 'not-started' && Boolean(this.actions.getPath().trim());
    this.send.disabled = !(model.state === 'ready' || canStart) || model.resetting || model.disposed || !(model.draft.trim() || model.selection || model.file);
    this.send.title = canStart ? 'Start Kiro and send this prompt' : 'Send prompt';
    this.start.disabled = model.state !== 'not-started' || model.resetting || this.startPending;
    this.path.disabled = model.state !== 'not-started' || model.resetting;
    this.path.hidden = Boolean(this.actions.getPath().trim());
    this.pathHelp.hidden = !this.path.hidden;
    this.reset.disabled = model.resetting || model.disposed;
    this.attach.disabled = model.resetting || model.disposed;
    this.attachFile.disabled = model.resetting || model.disposed;
    this.attachFile.textContent = model.file ? '✓ File' : '+ File';
    this.attachFile.setAttribute('aria-pressed', String(Boolean(model.file)));
    this.attach.textContent = model.selection ? '↻ Selection' : '+ Selection';
    this.attach.title = model.selection ? 'Update the attached selection from the current note' : 'Attach selected text from the current note';
    this.stop.hidden = !['starting', 'working', 'waiting-for-approval', 'stopping'].includes(model.state);
    this.stop.disabled = model.state === 'stopping' || model.resetting;
    this.force.hidden = !model.forceAvailable;
    this.force.disabled = model.resetting;
    this.shortcut.hidden = !this.stop.hidden;
  }

  render() {
    const model = this.model;
    this.status.textContent = STATES[model.state] ?? model.state;
    this.status.dataset.state = model.state;
    this.identity.textContent = model.identity || 'One conversation · local CLI';
    this.error.textContent = model.error + (model.cleanup === 'observed' ? `${model.error ? '\n' : ''}Owned process cleanup observed.` : '');
    this.error.hidden = !this.error.textContent;
    const path = this.actions.getPath();
    if (this.lastPath !== path && this.document.activeElement !== this.path) this.path.value = path;
    this.lastPath = path;
    this.startArea.hidden = model.state !== 'not-started';
    this.empty.hidden = model.messages.length > 0;
    this.composer.value = model.draft;
    this.renderControls();
    this.renderMessages();
    this.renderSelection();
    this.renderPermission();
  }

  renderMessages() {
    const nearBottom = this.transcript.scrollHeight - this.transcript.scrollTop - this.transcript.clientHeight < 80;
    const existing = new Set(this.model.messages);
    for (const [message, row] of this.rows) {
      if (!existing.has(message)) { row.root.remove(); this.rows.delete(message); }
    }
    for (const message of this.model.messages) {
      let row = this.rows.get(message);
      if (!row) {
        const root = this.el('article', `sir-scribbles-message sir-scribbles-${message.role}`);
        const header = this.el('div', 'sir-scribbles-message-header');
        const label = this.el('span', '', message.role === 'user' ? 'You' : message.role === 'tool' ? 'Tool activity' : 'Kiro');
        const timestamp = this.el('time', 'sir-scribbles-timestamp');
        const date = new Date(message.timestamp ?? Date.now());
        timestamp.dateTime = date.toISOString();
        timestamp.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        timestamp.title = date.toLocaleString();
        header.append(label, timestamp, this.button('Copy', async () => {
          try { await this.actions.copyText(message.text); }
          catch { this.model.error = 'Could not copy. Select the text and copy it manually.'; this.model.changed(); }
        }, 'sir-scribbles-copy'));
        let body;
        if (message.role === 'tool') {
          const details = this.el('details', 'sir-scribbles-tool-details');
          body = this.el('pre', 'sir-scribbles-plain-text');
          const summary = this.el('summary');
          details.append(summary, body);
          root.append(header, details);
          row = { root, body, summary, label, rendered: '' };
        } else {
          body = this.el('div', message.role === 'agent' ? 'sir-scribbles-markdown' : 'sir-scribbles-plain-text');
          root.append(header, body);
          row = { root, body, label, rendered: '' };
        }
        this.rows.set(message, row);
        this.transcript.append(root);
      }
      if (row.summary) row.summary.textContent = `${typeof message.data.title === 'string' ? message.data.title : 'Tool'} · ${typeof message.data.status === 'string' ? message.data.status : 'pending'}`;
      // Reparse only a changed bot reply so incomplete streamed markup becomes
      // formatted as it arrives. Keep the message row, timestamp and Copy button.
      if (message.text !== row.rendered) {
        if (message.role === 'agent') renderMarkdown(row.body, message.text, {
          sourcePath: message.sourcePath,
          openNote: this.actions.openNote ? async (...args) => {
            try { if (!this.disposed) await this.actions.openNote(...args); }
            catch { if (!this.disposed) { this.model.error = 'Could not open that note in this vault.'; this.model.changed(); } }
          } : undefined,
        });
        else row.body.textContent = message.text;
      }
      row.rendered = message.text;
    }
    if (nearBottom) this.transcript.scrollTop = this.transcript.scrollHeight;
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
      const fileCard = this.el('div', 'sir-scribbles-context-card sir-scribbles-file-card');
      const fileRow = this.el('div', 'sir-scribbles-selection-header');
      const path = this.el('span', 'sir-scribbles-context-path', file.path);
      path.title = `${file.path} · path only`;
      const remove = this.button('×', () => this.model.removeFile(), 'sir-scribbles-context-remove');
      remove.setAttribute('aria-label', 'Remove file');
      remove.title = 'Remove file';
      fileRow.append(this.el('span', 'sir-scribbles-context-label', '✓ File'), path, remove);
      fileCard.append(fileRow);
      this.selectionArea.append(fileCard);
    }
    if (!selection) return;
    const top = this.el('div', 'sir-scribbles-selection-header');
    const selectionCard = this.el('div', 'sir-scribbles-context-card sir-scribbles-text-card');
    const path = this.el('span', 'sir-scribbles-context-path', `${selection.path}:${selection.from}–${selection.to}`);
    path.title = `${selection.path} · lines ${selection.from}–${selection.to}`;
    const remove = this.button('×', () => this.model.removeSelection(), 'sir-scribbles-context-remove');
    remove.setAttribute('aria-label', 'Remove selection');
    remove.title = 'Remove selection';
    top.append(this.el('span', 'sir-scribbles-context-label', 'Selection'), path, remove);
    selectionCard.append(top);
    const details = this.el('details');
    details.open = false;
    details.append(this.el('summary', '', 'Preview selected text'), this.el('pre', 'sir-scribbles-selection-text', selection.text));
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
    this.permissionArea.append(this.el('p', 'sir-scribbles-eyebrow', `YOUR DECISION · ${queued} queued`),
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
    details.append(this.el('summary', '', 'Complete action details'), this.el('pre', 'sir-scribbles-permission-input', JSON.stringify(card.request ? { request: card.request, resolvedToolCall: card.params.toolCall } : card.params)));
    this.permissionArea.append(details);
    const decisions = this.el('div', 'sir-scribbles-decisions');
    for (const option of card.options) {
      const button = this.button(`${option.kind === 'allow_once' ? 'Allow once' : 'Deny once'} · ${option.name}`, () => {
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
    this.model.off('change', this.listener);
    this.rows.clear();
    this.container.replaceChildren();
  }
}
