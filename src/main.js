import { Plugin, ItemView, PluginSettingTab, Setting, FileSystemAdapter, MarkdownView, Modal, Notice, setIcon } from 'obsidian';
import { ChatController } from './chat.js';
import { ChatTabs, TabbedPanel } from './tabs.js';
import { captureSelection, captureFile } from './draft.js';
import { validateExecutable } from './process.js';

const VIEW_TYPE = 'sir-scribbles';

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

class CloseModal extends Modal {
  constructor(app, resolve) { super(app); this.resolve = resolve; this.accepted = false; }
  onOpen() {
    this.titleEl.textContent = 'Close this chat?';
    this.contentEl.createEl('p', { text: 'This ends its agent, stops any reply in progress and discards the unsent prompt and selection. The agent keeps its own history, so you may be able to reopen the chat from Open a past chat.' });
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
    const cwd = adapter.getBasePath();
    this.tabs = this.plugin.tabs ?? new ChatTabs(() => new ChatController(cwd, {
      getSourcePath: () => this.plugin.lastEditor?.file?.path ?? '',
    }));
    if (this.tabs.disposed) this.tabs.recover();
    if (!this.tabs.chats.length) this.tabs.add();
    this.plugin.tabs = this.tabs;
    this.panel = new TabbedPanel(this.contentEl, this.tabs, {
      setIcon,
      getPath: () => this.plugin.executablePath,
      savePath: async path => { await validateExecutable(path); await this.plugin.savePath(path); },
      attachSelection: () => captureSelection(this.plugin.lastEditor, view =>
        view instanceof MarkdownView && this.app.workspace.getLeavesOfType('markdown').some(leaf => leaf.view === view)),
      attachFile: () => captureFile(this.plugin.lastEditor, view =>
        view instanceof MarkdownView && this.app.workspace.getLeavesOfType('markdown').some(leaf => leaf.view === view)),
      confirmClose: () => new Promise(resolve => new CloseModal(this.app, resolve).open()),
      copyText: text => this.contentEl.ownerDocument.defaultView.navigator.clipboard.writeText(text),
      openNote: async (target, sourcePath, newLeaf) => {
        if (typeof target === 'object') {
          if (target.vault && target.vault !== this.app.vault.getName()) throw new Error('Different vault');
          target = target.path;
        }
        await this.app.workspace.openLinkText(target, sourcePath, newLeaf);
      },
    });
  }
  async onClose() {
    this.closed = true;
    this.panel?.dispose();
    if (this.plugin.activeView !== this) return;
    this.plugin.activeView = null;
    this.plugin.lastEditor = null;
    const tabs = this.tabs;
    if (!tabs) return;
    // Keep the owner during asynchronous shutdown, preventing a fresh Start
    // from racing the old process groups' exit.
    this.plugin.cleanupPending = tabs.dispose();
    const clean = await this.plugin.cleanupPending;
    if (clean) this.plugin.tabs = null;
    else new Notice('Agent cleanup could not be confirmed. Reopen Sir Scribbles and force stop before starting another process.', 0);
    this.plugin.cleanupPending = null;
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
    this.registerView(VIEW_TYPE, leaf => new ScribblesView(leaf, this));
    this.addRibbonIcon('messages-square', 'Open Sir Scribbles', () => { void this.openChat(); });
    this.addCommand({ id: 'open-chat', name: 'Open chat', callback: () => { void this.openChat(); } });
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
  }
  async savePath(path) {
    storePath(this.app, path);
    this.executablePath = path;
    this.activeView?.panel?.renderAll();
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
    this.activeView?.panel?.dispose();
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
