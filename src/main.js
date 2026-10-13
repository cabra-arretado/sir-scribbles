import { Plugin, ItemView, PluginSettingTab, Setting, FileSystemAdapter, MarkdownView, Modal, Notice, getLinkpath, setIcon } from 'obsidian';
import { ChatController } from './chat.js';
import { ChatTabs, TabbedPanel } from './tabs.js';
import { captureSelection, captureFile } from './draft.js';
import { validateExecutable } from './process.js';
import { statusBarInset } from './layout.js';
import { FloatingChat, OPACITY, clampOpacity } from './floating.js';
import { FONTS, FONT_SIZE, DEFAULT_APPEARANCE, normalizeAppearance, applyAppearance, themeFontSize } from './appearance.js';

const VIEW_TYPE = 'sir-scribbles';
// States in which a chat has an agent doing something for the user.
const BUSY = ['starting', 'working', 'waiting-for-approval', 'stopping'];
// File types Obsidian displays in its own views. Agent links never create a
// note or hand another kind of file to the system's default app.
const NOTE_EXTENSIONS = new Set(['md', 'canvas', 'base', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif']);

// Device settings live in local storage, one key per vault. Plugin data lives
// inside the vault, where sync or a shared repository could change them.
function preferenceKey(app, name) {
  const adapter = app.vault.adapter;
  return adapter instanceof FileSystemAdapter ? `sir-scribbles:${name}:${adapter.getBasePath()}` : null;
}
// JSON preferences are a convenience: unreadable ones fall back to defaults,
// and a failed write still applies for this session.
function readPreferences(app, name) {
  const key = preferenceKey(app, name);
  return JSON.parse((key && globalThis.localStorage?.getItem(key)) || '{}');
}
function writePreferences(app, name, preferences) {
  const key = preferenceKey(app, name);
  try { if (key) globalThis.localStorage.setItem(key, JSON.stringify(preferences)); }
  catch { /* Kept for this session only. */ }
}
// The executable path decides what runs, so it is never vault content.
function pathKey(app) { return preferenceKey(app, 'executable'); }
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
function loadFloating(app) {
  try {
    const value = readPreferences(app, 'floating');
    const size = Number.isFinite(value?.size?.width) && Number.isFinite(value?.size?.height) ? { width: value.size.width, height: value.size.height } : null;
    return { enabled: value?.enabled === true, opacity: clampOpacity(value?.opacity), activeOpacity: clampOpacity(value?.activeOpacity, OPACITY.active), size };
  } catch { return { enabled: false, opacity: OPACITY.initial, activeOpacity: OPACITY.active, size: null }; }
}
function loadAppearance(app) {
  try { return normalizeAppearance(readPreferences(app, 'appearance')); }
  catch { return { ...DEFAULT_APPEARANCE }; }
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

// Typing a custom font waits for a pause, so half-typed names never show.
const CUSTOM_FONT_DELAY_MS = 400;

class ScribblesSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; this.pendingFont = null; }
  display() {
    this.flushFont();
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
    // The opacity sliders belong to the floating chat: one indented group,
    // shown only while it is on.
    let opacity;
    new Setting(this.containerEl).setName('Floating chat')
      .setDesc('Add a chat icon to the status bar that opens a translucent chat window over your notes, without opening the sidebar. Hiding the window keeps chats running. Turning this off moves chats with content to the sidebar and ends the rest.')
      .addToggle(toggle => toggle.setValue(this.plugin.floatingPreferences.enabled).onChange(async value => {
        opacity.hidden = !value;
        await this.plugin.setFloating({ enabled: value });
      }));
    opacity = this.containerEl.createEl('div', { cls: 'sir-scribbles-subsettings' });
    opacity.hidden = !this.plugin.floatingPreferences.enabled;
    new Setting(opacity).setName('Opacity while in use')
      .setDesc('While the pointer is over the window or you are typing in it.')
      .addSlider(slider => slider.setLimits(OPACITY.min, OPACITY.max, OPACITY.step).setValue(this.plugin.floatingPreferences.activeOpacity)
        .setDynamicTooltip().onChange(async value => { await this.plugin.setFloating({ activeOpacity: value }); }));
    new Setting(opacity).setName('Opacity when not in use')
      .setDesc('The rest of the time, so your notes show through.')
      .addSlider(slider => slider.setLimits(OPACITY.min, OPACITY.max, OPACITY.step).setValue(this.plugin.floatingPreferences.opacity)
        .setDynamicTooltip().onChange(async value => { await this.plugin.setFloating({ opacity: value }); }));
    this.displayAppearance();
  }
  displayAppearance() {
    const appearance = this.plugin.appearance;
    new Setting(this.containerEl).setName('Chat text').setHeading();
    let custom;
    new Setting(this.containerEl).setName('Font')
      .setDesc('The font for messages and the prompt, in the sidebar and the floating chat.')
      .addDropdown(dropdown => {
        for (const [value, { label }] of Object.entries(FONTS)) dropdown.addOption(value, label);
        dropdown.setValue(appearance.font).onChange(value => {
          custom.hidden = value !== 'custom';
          this.flushFont();
          this.plugin.setAppearance({ font: value });
        });
      });
    custom = this.containerEl.createEl('div', { cls: 'sir-scribbles-subsettings' });
    custom.hidden = appearance.font !== 'custom';
    new Setting(custom).setName('Custom font')
      .setDesc('The name of a font installed on this device, such as Inter or Fira Code. Separate fallbacks with commas.')
      .addText(text => {
        text.setPlaceholder('Inter').setValue(appearance.customFont).onChange(value => {
          this.flushFont(false);
          const apply = () => { this.pendingFont = null; this.plugin.setAppearance({ customFont: value }); };
          this.pendingFont = { apply, timer: setTimeout(apply, CUSTOM_FONT_DELAY_MS) };
        });
        // Leaving the field applies the name and shows it as it was saved.
        // Never while typing: tidying would eat a space before the next word.
        text.inputEl.addEventListener('blur', () => {
          this.flushFont();
          text.setValue(this.plugin.appearance.customFont);
        });
      });
    // While the size follows the theme, the slider sits at the theme's size.
    const theme = () => themeFontSize(this.containerEl.ownerDocument);
    let slider;
    new Setting(this.containerEl).setName('Text size')
      .setDesc(`In pixels, from ${FONT_SIZE.min} to ${FONT_SIZE.max}. Reset to follow the theme.`)
      .addSlider(control => {
        slider = control;
        control.setLimits(FONT_SIZE.min, FONT_SIZE.max, FONT_SIZE.step).setValue(appearance.fontSize ?? theme())
          .setDynamicTooltip().onChange(value => { this.plugin.setAppearance({ fontSize: value }); });
      })
      .addExtraButton(button => button.setIcon('rotate-ccw').setTooltip('Follow the theme').onClick(() => {
        // Move the slider first: if that reports a change, the reset still wins.
        slider?.setValue(theme());
        this.plugin.setAppearance({ fontSize: null });
      }));
  }
  // Applies a custom font still waiting for a pause, or drops it.
  flushFont(apply = true) {
    if (!this.pendingFont) return;
    clearTimeout(this.pendingFont.timer);
    if (apply) this.pendingFont.apply();
    this.pendingFont = null;
  }
  hide() { this.flushFont(); super.hide?.(); }
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
    this.appearance = loadAppearance(this.app);
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
    this.settingsTab = new ScribblesSettings(this.app, this);
    this.addSettingTab(this.settingsTab);
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
    if (this.floatingPreferences.enabled && this.vaultPath()) this.enableFloating();
  }
  async savePath(path) {
    storePath(this.app, path);
    this.executablePath = path;
    this.surface?.panel.renderAll();
  }
  setAppearance(changes) {
    this.appearance = normalizeAppearance({ ...this.appearance, ...changes });
    writePreferences(this.app, 'appearance', this.appearance);
    applyAppearance(this.surface?.container, this.appearance);
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
    // On the container itself, so a popout window's sidebar follows too.
    applyAppearance(container, this.appearance);
    this.surface = { container, panel };
    return panel;
  }
  unmount() {
    if (!this.surface) return;
    this.surface.panel.dispose();
    applyAppearance(this.surface.container, DEFAULT_APPEARANCE);
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
  // Chats being disposed must never be recovered into a view: that would let
  // a new draft or process start before the old process groups have exited.
  // Wait for any cleanup, then check the target is still wanted.
  async settled() {
    while (this.cleanupPending) await this.cleanupPending;
    return !this.unloaded;
  }
  async showFloating(body) {
    if (!(await this.settled()) || !this.floating.open || this.floating.body !== body) return;
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) this.lastEditor = active;
    this.unmount();
    if (this.activeView) this.placeholder(this.activeView);
    this.mount(body);
  }
  async hideFloating() {
    if (this.surface?.container === this.floating.body) this.unmount();
    const view = this.activeView;
    if (!view || !(await this.settled())) return;
    if (this.activeView !== view || view.closed || this.floating.open) return;
    view.panel = this.mount(view.contentEl);
  }
  async setFloating(changes) {
    this.floatingPreferences = { ...this.floatingPreferences, ...changes };
    this.floatingPreferences.opacity = clampOpacity(this.floatingPreferences.opacity);
    this.floatingPreferences.activeOpacity = clampOpacity(this.floatingPreferences.activeOpacity, OPACITY.active);
    writePreferences(this.app, 'floating', this.floatingPreferences);
    this.floating.setOpacity({ idle: this.floatingPreferences.opacity, active: this.floatingPreferences.activeOpacity });
    // A quick off-then-on waits for the teardown, so the launcher comes back.
    if (this.floating.disabling) await this.floating.disabling;
    if (this.floatingPreferences.enabled === this.floating.enabled || !this.vaultPath()) return;
    if (this.floatingPreferences.enabled) { this.enableFloating(); return; }
    await this.floating.disable();
    if (this.activeView || !this.tabs) return;
    // Nothing can show the chats now. Keep any with work in them visible in
    // the sidebar instead of silently ending them; end the rest.
    if (this.tabs.chats.some(chat => chat.messages.length || chat.hasDraft() || BUSY.includes(chat.state))) await this.openChat();
    else await this.releaseTabs();
  }
  // A new launcher starts from the chats' current states, not the next change.
  enableFloating() {
    this.floating.enable();
    this.activity();
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
    // A custom font waiting for a pause is saved now, never by a timer that
    // outlives this plugin and overwrites a reloaded one.
    this.settingsTab?.flushFont();
    this.unmount();
    this.lastEditor = null;
    // One shared shutdown: agent cleanup starts at once, and the floating
    // window's teardown runs beside it and is awaited too.
    if (!this.shutdownPending) this.shutdownPending = (async (teardown, cleanup) => {
      await teardown;
      const clean = (await cleanup) ?? true;
      if (!clean) new Notice('Agent cleanup could not be confirmed on unload. Check the CLI process in your terminal.', 0);
      return clean;
    })(this.floating?.disable(), this.cleanupPending ?? this.tabs?.dispose());
    return this.shutdownPending;
  }
  onunload() { void this.shutdown(); }
}
