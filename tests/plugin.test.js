import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'cjs', platform: 'node', external: ['obsidian'], write: false });

function create(t, preferences = {}) {
  const dom = new JSDOM('<body></body>');
  const leaves = [];
  const events = new Map();
  const writes = [];
  let launches = 0;
  const stored = new Map([['sir-scribbles:executable:/other-vault', '/fixture/other'], ...Object.entries(preferences)]);
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value),
  } });
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
  class Plugin {
    constructor(app) { this.app = app; }
    async loadData() { return { executablePath: '/vault-controlled/kiro' }; }
    async saveData(data) { writes.push(data); }
    registerView(type, factory) { this.factory = factory; }
    addRibbonIcon(icon, title, fn) { this.ribbon = fn; }
    addCommand(command) { this.command = command; }
    addSettingTab(tab) { this.settingTab = tab; }
    addStatusBarItem() { const item = dom.window.document.createElement('div'); item.className = 'status-bar-item'; dom.window.document.body.append(item); return item; }
    registerEvent() {}
  }
  class ItemView { constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = dom.window.document.createElement('div'); } register() {} registerEvent() {} }
  class MarkdownView {}
  class FileSystemAdapter { getBasePath() { return '/fixture-vault'; } }
  class Modal {}
  // Enough of Obsidian's settings API to render the tab and drive its controls.
  const domHelpers = node => Object.assign(node, {
    empty() { node.replaceChildren(); },
    createEl(tag, { text, cls, attr } = {}) {
      const child = domHelpers(dom.window.document.createElement(tag));
      if (text) child.textContent = text;
      if (cls) child.className = cls;
      for (const [name, value] of Object.entries(attr ?? {})) child.setAttribute(name, value);
      node.append(child);
      return child;
    },
  });
  class PluginSettingTab { constructor(app) { this.app = app; this.containerEl = domHelpers(dom.window.document.createElement('div')); } }
  class Setting {
    constructor(container) { this.el = container.createEl('div', { cls: 'setting-item' }); this.controls = {}; }
    setName(name) { this.el.dataset.name = name; return this; }
    setDesc() { return this; }
    control(kind, build) {
      const control = { kind, value: undefined, change: null };
      const api = new Proxy({}, { get: (_, key) => key === 'setValue' ? value => { control.value = value; return api; }
        : key === 'onChange' ? fn => { control.change = fn; return api; } : () => api });
      build(api);
      (this.el.controls ??= []).push(control);
      return this;
    }
    addText(build) { return this.control('text', build); }
    addButton(build) { return this.control('button', build); }
    addToggle(build) { return this.control('toggle', build); }
    addSlider(build) { return this.control('slider', build); }
  }
  class Notice {}
  const getLinkpath = link => link.split('#')[0];
  const api = { Plugin, ItemView, MarkdownView, FileSystemAdapter, Modal, PluginSettingTab, Setting, Notice, getLinkpath };
  const module = { exports: {} };
  const customRequire = name => {
    if (name === 'obsidian') return api;
    if (name === 'node:child_process') return { spawn: () => { launches++; throw new Error('Unexpected launch'); } };
    return require(name);
  };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(customRequire, module, module.exports);
  const app = { vault: { adapter: new FileSystemAdapter() }, workspace: {
    containerEl: dom.window.document.body,
    on: (name, fn) => events.set(name, fn),
    getActiveViewOfType: () => null,
    getLeavesOfType: type => leaves.filter(leaf => leaf.view?.getViewType?.() === type),
    revealLeaf: async () => {},
    getRightLeaf: () => leaves[0],
  } };
  const plugin = new module.exports.default(app);
  const leaf = { app, detached: false, detach() { this.detached = true; }, async setViewState() { this.view = plugin.factory(this); await this.view.onOpen(); } };
  leaves.push(leaf);
  t.after(async () => { await plugin.tabs?.dispose(); dom.window.close(); });
  return { plugin, app, leaf, leaves, events, writes, stored, document: dom.window.document, launches: () => launches };
}

test('Obsidian plugin enablement and restored sidebar never launch a CLI or persist content', async t => {
  const { plugin, leaf, launches, writes, stored } = create(t);
  await plugin.onload();
  assert.equal(plugin.executablePath, '', 'vault plugin data and other vaults never choose the executable');
  await leaf.setViewState();
  assert.equal(launches(), 0);
  assert.equal(plugin.tabs.active.state, 'not-started');
  plugin.tabs.active.setDraft('private draft');
  await plugin.savePath('/fixture/new-path');
  assert.deepEqual(writes, []);
  assert.equal(stored.get('sir-scribbles:executable:/fixture-vault'), '/fixture/new-path');
  await leaf.view.onClose();
  assert.equal(plugin.tabs, null);
  assert.equal(launches(), 0);
});

test('restored duplicate view detaches itself and does not close the first owner', async t => {
  const { plugin, leaf, app, launches } = create(t);
  await plugin.onload();
  await leaf.setViewState();
  const owner = plugin.tabs;
  const duplicateLeaf = { app, detach() { this.detached = true; } };
  const duplicate = plugin.factory(duplicateLeaf);
  await duplicate.onOpen();
  await duplicate.onClose();
  assert.equal(duplicateLeaf.detached, true);
  assert.equal(plugin.tabs, owner);
  assert.equal(owner.disposed, false);
  assert.equal(launches(), 0);
});

test('unloading during a pending view open prevents late controller creation', async t => {
  const { plugin, leaf, launches } = create(t);
  await plugin.onload();
  let finishCleanup;
  plugin.cleanupPending = new Promise(resolve => { finishCleanup = resolve; });
  const opening = leaf.setViewState();
  plugin.onunload();
  finishCleanup(true);
  await opening;
  assert.equal(plugin.tabs, null);
  assert.equal(launches(), 0);
});

test('note navigation uses Obsidian API and refuses links to another vault', async t => {
  const { plugin, app, leaf, launches } = create(t);
  const opened = [];
  app.vault.getName = () => 'Studio';
  app.workspace.openLinkText = async (...args) => { opened.push(args); };
  const files = { 'Notes/Example': 'md', 'Notes/Other': 'md', 'Tools/run.command': 'command', 'Site/page.html': 'html' };
  app.metadataCache = { getFirstLinkpathDest: path => path in files ? { path, extension: files[path] } : null };
  await plugin.onload();
  await leaf.setViewState();
  const open = leaf.view.panel.actions.openNote;
  await open('Notes/Example#Heading', 'Projects/source.md', true);
  await open({ path: 'Notes/Other', vault: 'Studio' }, '', false);
  await assert.rejects(open({ path: 'Private', vault: 'Different' }, '', false));
  // Missing notes are not created; other file types are not opened.
  await assert.rejects(open('Notes/Missing', '', false));
  await assert.rejects(open('Tools/run.command', '', false));
  await assert.rejects(open('Site/page.html', '', false));
  assert.deepEqual(opened, [
    ['Notes/Example#Heading', 'Projects/source.md', true],
    ['Notes/Other', '', false],
  ]);
  assert.equal(launches(), 0);
});

test('normal quit registers an awaited cleanup task shared with unload', async t => {
  const { plugin, leaf, events } = create(t);
  await plugin.onload();
  await leaf.setViewState();
  let finish;
  let calls = 0;
  plugin.tabs.dispose = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  let task;
  events.get('quit')({ add: callback => { task = callback(); } });
  assert.equal(plugin.unloaded, true);
  plugin.onunload();
  assert.equal(calls, 1);
  let settled = false;
  task.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  finish(true);
  await task;
  assert.equal(settled, true);
  plugin.tabs = null;
});

const FLOATING = { 'sir-scribbles:floating:/fixture-vault': JSON.stringify({ enabled: true, opacity: 70 }) };

test('floating chat is off by default and its preference is per device and vault', async t => {
  const { plugin, document, stored } = create(t, { 'sir-scribbles:floating:/other-vault': JSON.stringify({ enabled: true }) });
  await plugin.onload();
  assert.equal(plugin.floating.enabled, false);
  assert.equal(document.querySelector('.sir-scribbles-floating-launcher'), null);
  await plugin.setFloating({ enabled: true, opacity: 5 });
  assert.equal(plugin.floating.enabled, true);
  assert.deepEqual(JSON.parse(stored.get('sir-scribbles:floating:/fixture-vault')), { enabled: true, opacity: 40, activeOpacity: 100, size: null });
});

test('floating chat shows the same chats without the sidebar and keeps them while hidden', async t => {
  const { plugin, document, launches, writes } = create(t, FLOATING);
  await plugin.onload();
  const launcher = document.querySelector('.sir-scribbles-floating-launcher');
  assert.ok(launcher.parentElement.classList.contains('status-bar-item'), 'the launcher lives in the status bar');
  assert.ok(launcher.parentElement.classList.contains('sir-scribbles-floating-item'), 'its item gets status bar sizing');
  assert.equal(plugin.tabs, null, 'enabling creates no chat until the window opens');
  await plugin.floating.show();
  const tabs = plugin.tabs;
  assert.equal(plugin.surface.container, plugin.floating.body);
  assert.ok(plugin.floating.body.querySelector('.sir-scribbles-tabs'));
  tabs.active.setDraft('Keep me');
  await plugin.floating.hide();
  assert.equal(plugin.tabs, tabs);
  assert.equal(tabs.disposed, false);
  assert.equal(plugin.surface, null);
  await plugin.floating.show();
  assert.equal(plugin.tabs.active.draft, 'Keep me');
  assert.equal(launches(), 0);
  assert.deepEqual(writes, []);
});

test('the sidebar and floating window take turns showing the chats', async t => {
  const { plugin, leaf } = create(t, FLOATING);
  await plugin.onload();
  await leaf.setViewState();
  const tabs = plugin.tabs;
  assert.equal(plugin.surface.container, leaf.view.contentEl);
  await plugin.floating.show();
  assert.equal(plugin.surface.container, plugin.floating.body);
  assert.equal(leaf.view.panel, null);
  const show = leaf.view.contentEl.querySelector('.sir-scribbles-elsewhere button');
  assert.equal(show.textContent, 'Show chats here');
  show.click();
  await Promise.resolve();
  assert.equal(plugin.floating.open, false);
  assert.equal(plugin.surface.container, leaf.view.contentEl);
  assert.equal(leaf.view.panel, plugin.surface.panel);
  assert.equal(plugin.tabs, tabs);
});

test('closing the sidebar keeps chats for the floating window; turning floating off then ends them', async t => {
  const { plugin, leaf } = create(t, FLOATING);
  await plugin.onload();
  await leaf.setViewState();
  const tabs = plugin.tabs;
  await leaf.view.onClose();
  assert.equal(plugin.tabs, tabs);
  assert.equal(tabs.disposed, false);
  await plugin.setFloating({ enabled: false });
  assert.equal(plugin.floating.enabled, false);
  assert.equal(tabs.disposed, true);
  assert.equal(plugin.tabs, null);
});

test('turning floating off while the sidebar is open moves the chats back to it', async t => {
  const { plugin, leaf } = create(t, FLOATING);
  await plugin.onload();
  await leaf.setViewState();
  const tabs = plugin.tabs;
  await plugin.floating.show();
  await plugin.setFloating({ enabled: false });
  assert.equal(plugin.surface.container, leaf.view.contentEl);
  assert.equal(plugin.tabs, tabs);
  assert.equal(tabs.disposed, false);
});

test('unloading removes the floating chat and ends its chats', async t => {
  const { plugin, document } = create(t, FLOATING);
  await plugin.onload();
  await plugin.floating.show();
  const tabs = plugin.tabs;
  await plugin.shutdown();
  assert.equal(document.querySelector('.sir-scribbles-floating, .sir-scribbles-floating-launcher, .status-bar-item'), null);
  assert.equal(tabs.disposed, true);
});

test('the floating window size is remembered per device and restored on load', async t => {
  const { plugin, stored } = create(t, { 'sir-scribbles:floating:/fixture-vault': JSON.stringify({ enabled: true, size: { width: 520, height: 480 } }) });
  await plugin.onload();
  assert.equal(plugin.floating.window.style.width, '520px');
  assert.equal(plugin.floating.window.style.height, '480px');
  const grip = plugin.floating.window.querySelector('.sir-scribbles-floating-resize');
  grip.dispatchEvent(new grip.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  await Promise.resolve();
  assert.deepEqual(JSON.parse(stored.get('sir-scribbles:floating:/fixture-vault')).size, { width: 540, height: 480 });
});

test('both opacity settings are stored and applied to the window', async t => {
  const { plugin, stored } = create(t, FLOATING);
  await plugin.onload();
  const style = plugin.floating.window.style;
  assert.equal(style.getPropertyValue('--sir-scribbles-floating-opacity'), '0.7');
  assert.equal(style.getPropertyValue('--sir-scribbles-floating-active-opacity'), '1');
  await plugin.setFloating({ activeOpacity: 95 });
  assert.equal(style.getPropertyValue('--sir-scribbles-floating-active-opacity'), '0.95');
  assert.equal(JSON.parse(stored.get('sir-scribbles:floating:/fixture-vault')).activeOpacity, 95);
});

test('opacity settings are grouped under Floating chat and shown only while it is on', async t => {
  const { plugin } = create(t);
  await plugin.onload();
  const tab = plugin.settingTab;
  tab.display();
  const item = name => [...tab.containerEl.querySelectorAll('.setting-item')].find(node => node.dataset.name === name);
  const group = tab.containerEl.querySelector('.sir-scribbles-subsettings');
  assert.equal(item('Floating chat').nextElementSibling, group, 'the group sits right under its switch');
  assert.deepEqual([...group.children].map(node => node.dataset.name), ['Opacity while in use', 'Opacity when not in use']);
  assert.equal(group.hidden, true, 'hidden while floating chat is off');
  const toggle = item('Floating chat').controls[0];
  await toggle.change(true);
  assert.equal(group.hidden, false);
  assert.equal(plugin.floating.enabled, true);
  await toggle.change(false);
  assert.equal(group.hidden, true);
  await plugin.setFloating({ enabled: true });
  tab.display();
  assert.equal(tab.containerEl.querySelector('.sir-scribbles-subsettings').hidden, false, 'reopening the tab shows the group when on');
});

test('turning floating off keeps chats with work and shows them in the sidebar', async t => {
  const { plugin, leaf } = create(t, FLOATING);
  await plugin.onload();
  await plugin.floating.show();
  const tabs = plugin.tabs;
  tabs.active.setDraft('Unsent thought');
  await plugin.setFloating({ enabled: false });
  assert.equal(tabs.disposed, false, 'a draft is never discarded by a setting');
  assert.equal(plugin.tabs, tabs);
  assert.equal(plugin.activeView, leaf.view, 'the sidebar opened to show them');
  assert.equal(plugin.surface.container, leaf.view.contentEl);
  assert.equal(plugin.tabs.active.draft, 'Unsent thought');
});

test('hiding the window never recovers chats that are still cleaning up', async t => {
  const { plugin, leaf } = create(t, FLOATING);
  await plugin.onload();
  await leaf.setViewState();
  await plugin.floating.show();
  // An earlier owner is still shutting its process groups down.
  let settle;
  plugin.cleanupPending = new Promise(resolve => { settle = resolve; });
  const hiding = plugin.floating.hide();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(plugin.surface, null, 'no view, so no control can start a process yet');
  assert.equal(leaf.view.contentEl.querySelector('.sir-scribbles-tabs, textarea, .sir-scribbles-primary'), null);
  plugin.cleanupPending = null;
  settle(true);
  await hiding;
  assert.equal(plugin.surface.container, leaf.view.contentEl, 'mounted once cleanup settled');
});

test('a chat waiting before floating is enabled lights the new launcher at once', async t => {
  const { plugin, leaf } = create(t);
  await plugin.onload();
  await leaf.setViewState();
  plugin.tabs.active.state = 'waiting-for-approval';
  await plugin.setFloating({ enabled: true });
  assert.equal(plugin.floating.launcher.dataset.activity, 'approval');
});

test('a chat already working lights the launcher when floating is restored on load', async t => {
  const { plugin, leaf } = create(t);
  await plugin.onload();
  await leaf.setViewState();
  plugin.tabs.active.state = 'working';
  plugin.floatingPreferences.enabled = true;
  plugin.enableFloating();
  assert.equal(plugin.floating.launcher.dataset.activity, 'working');
});

test('repeated shutdown shares one floating teardown and never rejects', async t => {
  const { plugin, document } = create(t, FLOATING);
  await plugin.onload();
  await plugin.floating.show();
  let teardowns = 0;
  const disable = plugin.floating.disable.bind(plugin.floating);
  plugin.floating.disable = () => { teardowns++; return disable(); };
  const results = await Promise.all([plugin.shutdown(), plugin.shutdown()]);
  assert.equal(teardowns, 1, 'the second shutdown reuses the first');
  assert.deepEqual(results, [true, true]);
  assert.equal(document.querySelector('.sir-scribbles-floating, .sir-scribbles-floating-launcher'), null);
});

test('turning floating off and straight back on leaves the launcher on', async t => {
  const { plugin } = create(t, FLOATING);
  await plugin.onload();
  await plugin.floating.show();
  const off = plugin.setFloating({ enabled: false });
  const on = plugin.setFloating({ enabled: true });
  await Promise.all([off, on]);
  assert.equal(plugin.floating.enabled, true);
});

// Cleanup that is still running when the window is hidden, settled by the test.
function deferCleanup(plugin) {
  let settle;
  plugin.cleanupPending = new Promise(resolve => { settle = resolve; });
  return () => { plugin.cleanupPending = null; settle(true); };
}

test('a hide waiting for cleanup never clears a window reopened meanwhile', async t => {
  const { plugin, leaf } = create(t, FLOATING);
  await plugin.onload();
  await leaf.setViewState();
  await plugin.floating.show();
  const settle = deferCleanup(plugin);
  const hiding = plugin.floating.hide();
  const showing = plugin.floating.show();
  assert.equal(plugin.floating.open, true);
  settle();
  await Promise.all([hiding, showing]);
  assert.equal(plugin.floating.open, true);
  assert.equal(plugin.surface.container, plugin.floating.body, 'the newer show owns the chats');
  assert.ok(plugin.floating.body.querySelector('textarea'), 'its composer is still there');
  assert.equal(plugin.floating.window.classList.contains('is-loading'), false);
  assert.ok(leaf.view.contentEl.querySelector('.sir-scribbles-elsewhere'), 'the sidebar still points at the window');
});

test('disabling while a hide waits for cleanup never rejects and returns the chats to the sidebar', async t => {
  const { plugin, leaf, document } = create(t, FLOATING);
  await plugin.onload();
  await leaf.setViewState();
  await plugin.floating.show();
  const settle = deferCleanup(plugin);
  const hiding = plugin.floating.hide();
  const disabling = plugin.setFloating({ enabled: false });
  settle();
  await Promise.all([hiding, disabling]);
  assert.equal(plugin.floating.enabled, false);
  assert.equal(document.querySelector('.sir-scribbles-floating'), null);
  assert.equal(plugin.surface.container, leaf.view.contentEl);
});

test('the launcher cannot reopen a window that is being disabled', async t => {
  const { plugin, leaf } = create(t, FLOATING);
  await plugin.onload();
  await leaf.setViewState();
  await plugin.floating.show();
  const settle = deferCleanup(plugin);
  const disabling = plugin.setFloating({ enabled: false });
  assert.equal(plugin.floating.launcher.disabled, true);
  plugin.floating.launcher.click();
  const showing = plugin.floating.show();
  assert.equal(plugin.floating.open, false);
  settle();
  await Promise.all([disabling, showing]);
  assert.equal(plugin.floating.enabled, false);
  assert.equal(plugin.surface.container, leaf.view.contentEl, 'the sidebar owns the chats');
  assert.ok(leaf.view.contentEl.querySelector('textarea'), 'with a composer');
  assert.equal(leaf.view.contentEl.querySelector('.sir-scribbles-elsewhere'), null);
});
