import { Plugin, ItemView, PluginSettingTab, Setting, FileSystemAdapter, MarkdownView, Modal, Notice, getLinkpath, setIcon } from 'obsidian';
import { ChatController } from './chat.js';
import { ChatTabs, TabbedPanel } from './tabs.js';
import { captureSelection, captureFile } from './draft.js';
import { validateExecutable } from './process.js';
import { statusBarInset } from './layout.js';
import { FloatingChat, OPACITY, clampOpacity } from './floating.js';

const VIEW_TYPE = 'sir-scribbles';
// File types Obsidian displays in its own views. Agent links never create a
// note or hand another kind of file to the system's default app.
const NOTE_EXTENSIONS = new Set(['md', 'canvas', 'base', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif']);

// The executable path is a device setting, not vault content. Plugin data lives
// inside the vault, where sync or a shared repository could change what runs.
function pathKey(app) {
  const adapter = app.vault.adapter;
  return adapter instanceof FileSystemAdapter ? `sir-scribbles:executable:${adapter.getBasePath()}` : null;
}
function loadPath(app) {
  const key = pathKey(app);
  try { const value = key && globalThis.localStorage?.getItem(key); return typeof value === 'string' ? value : ''; }
  catch { return ''; }
}
function storePath(app, path) {
  const key = pathKey(app);
  if (!key) throw new Error('Local desktop vault required');
  globalThis.localStorage.setItem(key, path);
}
// Floating chat preferences are per device too, beside the executable path.
function floatingKey(app) {
  const adapter = app.vault.adapter;
  return adapter instanceof FileSystemAdapter ? `sir-scribbles:floating:${adapter.getBasePath()}` : null;
}
function loadFloating(app) {
  const key = floatingKey(app);
  try {
    const value = JSON.parse((key && globalThis.localStorage?.getItem(key)) || '{}');
    const size = Number.isFinite(value?.size?.width) && Number.isFinite(value?.size?.height) ? { width: value.size.width, height: value.size.height } : null;
    return { enabled: value?.enabled === true, opacity: clampOpacity(value?.opacity), activeOpacity: clampOpacity(value?.activeOpacity, OPACITY.active), size };
  } catch { return { enabled: false, opacity: OPACITY.initial, activeOpacity: OPACITY.active, size: null }; }
}
function storeFloating(app, preferences) {
  const key = floatingKey(app);
  try { if (key) globalThis.localStorage.setItem(key, JSON.stringify(preferences)); }
  catch { /* Preferences are a convenience; the setting still applies for this session. */ }
}

class CloseModal extends Modal {
  constructor(app, resolve) { super(app); this.resolve = resolve; this.accepted = false; }
  onOpen() {
    this.titleEl.textContent = 'Close this chat?';
    this.contentEl.createEl('p', { text: 'This ends its agent, stops any reply in progress and discards the unsent prompt and its attachments. The agent keeps its own history, so you may be able to reopen the chat from Past chats.' });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText('Keep chat').onClick(() => this.close()))
      .addButton(button => button.setButtonText('Close chat').setCta().onClick(() => { this.accepted = true; this.close(); }));
  }
  onClose() { this.resolve(this.accepted); this.contentEl.empty(); }
}

class ScribblesView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Sir Scribbles'; }
  getIcon() { return 'messages-square'; }
  async onOpen() {
    if (this.plugin.activeView && this.plugin.activeView !== this) {
      this.leaf.detach(); // Restored duplicate layouts focus one owner; never launch a second process.
      return;
    }
    this.plugin.activeView = this;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      this.contentEl.textContent = 'Sir Scribbles requires a local desktop vault.';
      return;
    }
    if (this.plugin.cleanupPending) await this.plugin.cleanupPending;
    if (this.closed || this.plugin.unloaded) return;
    this.plugin.showSidebar(this);
    this.reserveStatusBar();
  }
  // Keep the composer clear of the floating status bar. Only the footer moves,
  // so the measured overlap never changes the view's own size.
  reserveStatusBar() {
    const view = this.contentEl;
    const update = () => view.style.setProperty('--sir-scribbles-status-bar-inset', `${statusBarInset(view)}px`);
    update();
    const Observer = view.ownerDocument.defaultView.ResizeObserver;
    if (Observer) {
      const observer = new Observer(update);
      observer.observe(view);
      const bar = view.ownerDocument.querySelector('.status-bar');
      if (bar) observer.observe(bar);
      this.register(() => observer.disconnect());
    }
    this.registerEvent(this.app.workspace.on('layout-change', update));
    this.registerEvent(this.app.workspace.on('css-change', update));
  }
  async onClose() {
    this.closed = true;
    if (this.plugin.activeView !== this) return;
    this.plugin.activeView = null;
    if (this.plugin.surface?.container === this.contentEl) this.plugin.unmount();
    this.panel = null;
    // The floating chat keeps the chats; otherwise closing the sidebar ends them.
    if (!this.plugin.floating.enabled) await this.plugin.releaseTabs();
  }
}

class ScribblesSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl('p', { text: 'macOS developer preview. Install and sign in to your ACP agent in your terminal; Kiro CLI (V3) is currently the only supported agent. Selecting a path does not run it.' });
    let path = this.plugin.executablePath;
    const status = this.containerEl.createEl('p', { attr: { role: 'status' } });
    new Setting(this.containerEl).setName('Agent executable').setDesc('Absolute path to the existing CLI executable.')
      .addText(text => text.setPlaceholder('/absolute/path/to/agent').setValue(path).onChange(value => { path = value.trim(); }))
      .addButton(button => button.setButtonText('Validate and save').onClick(async () => {
        try { await validateExecutable(path); await this.plugin.savePath(path); status.textContent = 'Executable path saved. The agent was not started.'; }
        catch { status.textContent = 'Choose an existing executable using its absolute path.'; }
      }));
    new Setting(this.containerEl).setName('Floating chat')
      .setDesc('Show a chat button over your notes that opens a translucent chat window, without opening the sidebar. Hiding the window keeps chats running; turning this off while the sidebar is closed ends them.')
      .addToggle(toggle => toggle.setValue(this.plugin.floatingPreferences.enabled).onChange(async value => {
        await this.plugin.setFloating({ enabled: value });
      }));
    new Setting(this.containerEl).setName('Floating chat opacity while in use')
      .setDesc('How opaque the floating window is while the pointer is over it or you are typing in it.')
      .addSlider(slider => slider.setLimits(OPACITY.min, OPACITY.max, OPACITY.step).setValue(this.plugin.floatingPreferences.activeOpacity)
        .setDynamicTooltip().onChange(async value => { await this.plugin.setFloating({ activeOpacity: value }); }));
    new Setting(this.containerEl).setName('Floating chat opacity when not in use')
      .setDesc('How opaque the floating window is while the pointer is elsewhere and you are not typing in it, so your notes show through.')
      .addSlider(slider => slider.setLimits(OPACITY.min, OPACITY.max, OPACITY.step).setValue(this.plugin.floatingPreferences.opacity)
        .setDynamicTooltip().onChange(async value => { await this.plugin.setFloating({ opacity: value }); }));
  }
}

export default class SirScribblesPlugin extends Plugin {
  async onload() {
    this.unloaded = false;
    this.shutdownPending = null;
    this.executablePath = loadPath(this.app);
    this.lastEditor = null;
    this.activeView = null;
    this.tabs = null;
    this.cleanupPending = null;
    this.surface = null;
    this.activity = () => this.floating.setActivity(this.tabs?.chats.map(chat => chat.state) ?? []);
    this.floatingPreferences = loadFloating(this.app);
    this.floating = new FloatingChat(this.app.workspace.containerEl?.ownerDocument ?? globalThis.document, {
      setIcon,
      onShow: body => this.showFloating(body),
      onHide: () => this.hideFloating(),
      onSidebar: async () => { await this.floating.hide({ focus: false }); await this.openChat(); },
      onResize: size => { void this.setFloating({ size }); },
      // The status bar is always visible and never covers a note or the sidebar.
      launcherHost: () => this.addStatusBarItem(),
    });
    this.floating.setOpacity({ idle: this.floatingPreferences.opacity, active: this.floatingPreferences.activeOpacity });
    this.floating.setSize(this.floatingPreferences.size);
    this.registerView(VIEW_TYPE, leaf => new ScribblesView(leaf, this));
    this.addRibbonIcon('messages-square', 'Open Sir Scribbles', () => { void this.openChat(); });
    this.addCommand({ id: 'open-chat', name: 'Open chat', callback: () => { void this.openChat(); } });
    this.addCommand({ id: 'toggle-floating-chat', name: 'Show or hide floating chat', checkCallback: checking => {
      if (!this.floating.enabled) return false;
      if (!checking) void this.floating.toggle();
      return true;
    } });
    this.addSettingTab(new ScribblesSettings(this.app, this));
    this.registerEvent(this.app.workspace.on('quit', tasks => {
      // Obsidian waits for Tasks during a normal quit. Plugin onunload alone
      // cannot keep the app alive while asynchronous process cleanup finishes.
      tasks.add(() => this.shutdown());
    }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
      if (leaf?.view instanceof MarkdownView) this.lastEditor = leaf.view;
    }));
    // Reads only editor identity. Context text is captured exclusively on Attach click.
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) this.lastEditor = active;
    if (this.floatingPreferences.enabled && this.vaultPath()) this.floating.enable();
  }
  async savePath(path) {
    storePath(this.app, path);
    this.executablePath = path;
    this.surface?.panel.renderAll();
  }
  vaultPath() {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
  }

  // One set of chats, shown in one place at a time: the sidebar or the
  // floating window. Panels are views only; moving them never stops an agent.
  ensureTabs() {
    if (!this.tabs) {
      const cwd = this.vaultPath();
      this.tabs = new ChatTabs(() => new ChatController(cwd, {
        getSourcePath: () => this.lastEditor?.file?.path ?? '',
      }));
    }
    if (this.tabs.disposed) this.tabs.recover();
    // Disposing drops every listener, so the launcher's is re-added each time.
    this.tabs.off('change', this.activity);
    this.tabs.on('change', this.activity);
    if (!this.tabs.chats.length) this.tabs.add();
    return this.tabs;
  }
  mount(container) {
    this.unmount();
    const panel = new TabbedPanel(container, this.ensureTabs(), this.panelActions(container));
    this.surface = { container, panel };
    return panel;
  }
  unmount() {
    if (!this.surface) return;
    this.surface.panel.dispose();
    this.surface = null;
  }
  panelActions(container) {
    const cwd = this.vaultPath();
    const isEditor = view => view instanceof MarkdownView && this.app.workspace.getLeavesOfType('markdown').some(leaf => leaf.view === view);
    return {
      setIcon,
      getPath: () => this.executablePath,
      savePath: async path => { await validateExecutable(path); await this.savePath(path); },
      attachSelection: () => captureSelection(this.lastEditor, isEditor),
      attachFile: () => captureFile(this.lastEditor, isEditor),
      confirmClose: () => new Promise(resolve => new CloseModal(this.app, resolve).open()),
      copyText: text => container.ownerDocument.defaultView.navigator.clipboard.writeText(text),
      vaultPath: cwd,
      openNote: async (target, sourcePath, newLeaf) => {
        if (typeof target === 'object') {
          if (target.vault && target.vault !== this.app.vault.getName()) throw new Error('Different vault');
          target = target.path;
        }
        const file = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(target), sourcePath);
        if (!file || !NOTE_EXTENSIONS.has(file.extension.toLowerCase())) throw new Error('Not a note in this vault');
        await this.app.workspace.openLinkText(target, sourcePath, newLeaf);
      },
    };
  }
  showSidebar(view) {
    if (this.floating.open) this.placeholder(view);
    else view.panel = this.mount(view.contentEl);
  }
  // The sidebar stays open but points at the floating window.
  placeholder(view) {
    view.panel = null;
    const doc = view.contentEl.ownerDocument;
    const box = doc.createElement('div');
    box.className = 'sir-scribbles-elsewhere';
    const text = doc.createElement('p');
    text.textContent = 'Your chats are open in the floating window.';
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = 'Show chats here';
    button.addEventListener('click', () => { void this.floating.hide({ focus: false }); });
    box.append(text, button);
    view.contentEl.replaceChildren(box);
    view.contentEl.classList.add('sir-scribbles-root');
  }
  async showFloating(body) {
    if (this.cleanupPending) await this.cleanupPending;
    if (this.unloaded || !this.floating.open) return;
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) this.lastEditor = active;
    this.unmount();
    if (this.activeView) this.placeholder(this.activeView);
    this.mount(body);
  }
  hideFloating() {
    if (this.surface?.container === this.floating.body) this.unmount();
    if (this.activeView && !this.unloaded) this.activeView.panel = this.mount(this.activeView.contentEl);
  }
  async setFloating(changes) {
    this.floatingPreferences = { ...this.floatingPreferences, ...changes };
    this.floatingPreferences.opacity = clampOpacity(this.floatingPreferences.opacity);
    this.floatingPreferences.activeOpacity = clampOpacity(this.floatingPreferences.activeOpacity, OPACITY.active);
    storeFloating(this.app, this.floatingPreferences);
    this.floating.setOpacity({ idle: this.floatingPreferences.opacity, active: this.floatingPreferences.activeOpacity });
    if (this.floatingPreferences.enabled === this.floating.enabled || !this.vaultPath()) return;
    if (this.floatingPreferences.enabled) { this.floating.enable(); return; }
    await this.floating.disable();
    // With neither the sidebar nor the floating chat, nothing can show the chats.
    if (!this.activeView) await this.releaseTabs();
  }
  // Ends every agent. Keeps the owner during asynchronous shutdown, preventing
  // a fresh Start from racing the old process groups' exit.
  async releaseTabs() {
    const tabs = this.tabs;
    if (!tabs || this.cleanupPending) return;
    this.lastEditor = null;
    this.floating.setActivity([]);
    this.cleanupPending = tabs.dispose();
    const clean = await this.cleanupPending;
    if (clean) { if (this.tabs === tabs) this.tabs = null; }
    else new Notice('Agent cleanup could not be confirmed. Reopen Sir Scribbles and force stop before starting another process.', 0);
    this.cleanupPending = null;
  }
  async openChat() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) { await this.app.workspace.revealLeaf(existing); return; }
    if (this.cleanupPending) await this.cleanupPending;
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) this.lastEditor = active;
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) { await leaf.setViewState({ type: VIEW_TYPE, active: true }); await this.app.workspace.revealLeaf(leaf); }
  }
  async shutdown() {
    this.unloaded = true;
    this.unmount();
    this.floating?.disable();
    this.lastEditor = null;
    if (!this.shutdownPending) this.shutdownPending = (async () => {
      const clean = (await (this.cleanupPending ?? this.tabs?.dispose())) ?? true;
      if (!clean) new Notice('Agent cleanup could not be confirmed on unload. Check the CLI process in your terminal.', 0);
      return clean;
    })();
    return this.shutdownPending;
  }
  onunload() { void this.shutdown(); }
}
