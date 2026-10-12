import { EventEmitter } from 'node:events';
import { LIMITS } from './limits.js';
import { ChatPanel } from './panel.js';

const BUSY = ['starting', 'working', 'waiting-for-approval', 'stopping'];

// Several chats side by side. Each owns its controller and agent process, so
// one chat's failure, approval queue or memory budget never touches another.
export class ChatTabs extends EventEmitter {
  constructor(createChat, limit = LIMITS.chats) {
    super();
    this.createChat = createChat;
    this.limit = limit;
    this.chats = [];
    this.active = null;
    this.disposed = false;
    this.listener = () => this.emit('change');
  }
  get full() { return this.chats.length >= this.limit; }
  add() {
    if (this.disposed || this.full) return null;
    const chat = this.createChat();
    chat.on('change', this.listener);
    this.chats.push(chat);
    this.active = chat;
    this.emit('change');
    return chat;
  }
  select(chat) {
    if (!this.chats.includes(chat) || chat === this.active) return;
    this.active = chat;
    this.emit('change');
  }
  canRunParallel(chat) {
    return !this.disposed && !this.full && this.chats.includes(chat) && !chat.disposed && !chat.resetting &&
      !chat.closing && !chat.configPending && !chat.reading &&
      ['ready', 'working', 'waiting-for-approval'].includes(chat.state) &&
      chat.hasDraft();
  }
  // A fresh ACP session in its own owned process. It receives only the draft
  // and explicit attachments, never the source chat's history or approvals.
  async runParallel(source, executable) {
    if (this.full) { source.setError('CHAT_LIMIT'); return null; }
    if (!executable || !this.canRunParallel(source)) return null;
    try { source.composeDraft(); }
    catch (error) { source.setError(error.code); return null; }
    const mode = source.modeOption?.()?.currentValue;
    const chat = this.add();
    chat.draft = source.draft;
    chat.selection = source.selection;
    chat.file = source.file;
    chat.attachments = [...(source.attachments ?? [])];
    const draft = chat.draft, selection = chat.selection, file = chat.file, attachments = chat.attachments;
    source.clearComposer();
    source.changed();
    chat.changed();
    const starting = chat.start(executable);
    const generation = chat.generation;
    await starting;
    if (chat.disposed || chat.resetting || chat.generation !== generation || chat.state !== 'ready') return chat;
    if (mode) {
      await chat.setMode(mode);
      if (chat.disposed || chat.resetting || chat.generation !== generation || chat.state !== 'ready') return chat;
      if (chat.error || chat.modeOption()?.currentValue !== mode) {
        if (!chat.error) chat.setError('PARALLEL_MODE_UNAVAILABLE');
        return chat;
      }
    }
    if (chat.reading || chat.configPending || chat.draft !== draft || chat.selection !== selection || chat.file !== file || chat.attachments !== attachments) {
      chat.setError('PARALLEL_DRAFT_CHANGED');
      return chat;
    }
    await chat.send();
    return chat;
  }
  // Ends the chat's agent. A chat whose cleanup is uncertain stays open so
  // the user can force stop it; the last tab is replaced by a fresh one.
  async close(chat) {
    if (this.disposed || !this.chats.includes(chat) || chat.closing) return false;
    chat.closing = true;
    this.emit('change');
    const clean = await chat.dispose();
    chat.closing = false;
    if (this.disposed) return clean;
    if (!clean) {
      chat.recoverCleanup();
      chat.on('change', this.listener);
      this.emit('change');
      return false;
    }
    const index = this.chats.indexOf(chat);
    this.chats.splice(index, 1);
    if (this.active === chat) this.active = this.chats[Math.min(index, this.chats.length - 1)] ?? null;
    if (this.chats.length) this.emit('change');
    else this.add();
    return true;
  }
  // Ends every agent. Chats with uncertain cleanup are kept for recover().
  async dispose() {
    this.disposed = true;
    const chats = this.chats;
    const results = await Promise.all(chats.map(chat => chat.dispose()));
    this.chats = chats.filter((chat, index) => !results[index]);
    this.active = this.chats[0] ?? null;
    return results.every(Boolean);
  }
  recover() {
    this.disposed = false;
    for (const chat of this.chats) {
      chat.recoverCleanup();
      chat.on('change', this.listener);
    }
  }
}

// Tab strip plus one ChatPanel per chat. Hidden panels keep their rows and
// scroll position, so switching tabs never re-renders a conversation.
export class TabbedPanel {
  constructor(container, tabs, actions) {
    this.container = container;
    this.tabs = tabs;
    this.actions = actions;
    this.document = container.ownerDocument;
    this.entries = new Map();
    this.timer = null;
    this.disposed = false;
    container.replaceChildren();
    container.classList.add('sir-scribbles-root');
    this.strip = this.el('div', 'sir-scribbles-tabs');
    this.strip.setAttribute('role', 'tablist');
    // No aria-label: Obsidian would show it as a tooltip over the whole strip.
    this.add = this.iconButton('plus', 'New chat', () => {
      const chat = this.tabs.add();
      if (chat) this.render();
    }, 'sir-scribbles-tab-add');
    this.panes = this.el('div', 'sir-scribbles-panes');
    container.append(this.strip, this.panes);
    this.listener = () => this.schedule();
    tabs.on('change', this.listener);
    this.render();
  }
  el(tag, className = '', text = '') {
    const node = this.document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }
  iconButton(icon, label, action, className) {
    const button = this.el('button', `clickable-icon ${className}`);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    if (this.actions.setIcon) this.actions.setIcon(button, icon);
    else button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }
  schedule() {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(() => { this.timer = null; if (!this.disposed) this.render(); }, 40);
  }
  entry(chat) {
    const pane = this.el('div');
    pane.setAttribute('role', 'tabpanel');
    this.panes.append(pane);
    const panel = new ChatPanel(pane, chat, {
      ...this.actions, confirmReset: undefined,
      runParallel: source => this.tabs.runParallel(source, this.actions.getPath().trim()),
      canRunParallel: source => this.tabs.canRunParallel(source),
      parallelTitle: () => this.tabs.full ? `Up to ${this.tabs.limit} chats at once. Close one to start another.` : 'Run draft in a parallel chat',
    });
    const tab = this.el('div', 'sir-scribbles-tab');
    const select = this.el('button', 'sir-scribbles-tab-select');
    select.type = 'button';
    select.setAttribute('role', 'tab');
    const status = this.el('span', 'sir-scribbles-tab-status');
    const title = this.el('span', 'sir-scribbles-tab-title');
    select.append(status, title);
    select.addEventListener('click', () => this.tabs.select(chat));
    const close = this.iconButton('x', 'Close chat', () => { void this.close(chat); }, 'sir-scribbles-tab-close');
    tab.append(select, close);
    return { pane, panel, tab, select, status, title, close };
  }
  async close(chat) {
    const unsaved = chat.messages.length || chat.draft || chat.selection || chat.file || chat.attachments?.length || BUSY.includes(chat.state);
    if (unsaved && !(await this.actions.confirmClose(chat))) return;
    if (!(await this.tabs.close(chat)) && !this.disposed && this.tabs.chats.includes(chat)) {
      // Disposing removed the panel's subscription with every other listener.
      // Rebuild it so the recovered state and Force stop are visible and live.
      this.discard(chat);
      this.render();
    }
  }
  discard(chat) {
    const entry = this.entries.get(chat);
    if (!entry) return;
    entry.panel.dispose();
    entry.pane.remove();
    entry.tab.remove();
    this.entries.delete(chat);
  }
  render() {
    for (const chat of [...this.entries.keys()]) {
      if (!this.tabs.chats.includes(chat)) this.discard(chat);
    }
    for (const chat of this.tabs.chats) {
      let entry = this.entries.get(chat);
      if (!entry) { entry = this.entry(chat); this.entries.set(chat, entry); }
      const active = chat === this.tabs.active;
      const title = chat.title || 'New chat';
      entry.title.textContent = title;
      entry.select.title = title;
      entry.status.dataset.state = chat.state;
      entry.select.setAttribute('aria-selected', String(active));
      entry.tab.classList.toggle('is-active', active);
      entry.close.disabled = Boolean(chat.closing);
      entry.pane.hidden = !active;
      // Tab capacity is shared: adding/closing a tab changes every fork button.
      entry.panel.renderControls();
    }
    // Re-appending keeps the strip in chat order with the add button last.
    this.strip.append(...this.tabs.chats.map(chat => this.entries.get(chat).tab), this.add);
    this.add.disabled = this.tabs.full;
    this.add.title = this.tabs.full ? `Up to ${this.tabs.limit} chats at once. Close one to start another.` : 'New chat';
  }
  // Re-render every chat, for example after the executable path changed.
  renderAll() {
    this.render();
    for (const { panel } of this.entries.values()) panel.render();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.tabs.off('change', this.listener);
    for (const { panel } of this.entries.values()) panel.dispose();
    this.entries.clear();
    this.container.replaceChildren();
  }
}
