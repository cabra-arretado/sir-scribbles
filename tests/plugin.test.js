import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'cjs', platform: 'node', external: ['obsidian'], write: false });

function create(t) {
  const dom = new JSDOM('<body></body>');
  const leaves = [];
  const events = new Map();
  const writes = [];
  let launches = 0;
  class Plugin {
    constructor(app) { this.app = app; }
    async loadData() { return { executablePath: '/fixture/kiro' }; }
    async saveData(data) { writes.push(data); }
    registerView(type, factory) { this.factory = factory; }
    addRibbonIcon(icon, title, fn) { this.ribbon = fn; }
    addCommand(command) { this.command = command; }
    addSettingTab() {}
    registerEvent() {}
  }
  class ItemView { constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = dom.window.document.createElement('div'); } }
  class MarkdownView {}
  class FileSystemAdapter { getBasePath() { return '/fixture-vault'; } }
  class Modal {}
  class PluginSettingTab {}
  class Setting {}
  class Notice {}
  const api = { Plugin, ItemView, MarkdownView, FileSystemAdapter, Modal, PluginSettingTab, Setting, Notice };
  const module = { exports: {} };
  const customRequire = name => {
    if (name === 'obsidian') return api;
    if (name === 'node:child_process') return { spawn: () => { launches++; throw new Error('Unexpected launch'); } };
    return require(name);
  };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(customRequire, module, module.exports);
  const app = { vault: { adapter: new FileSystemAdapter() }, workspace: {
    on: (name, fn) => events.set(name, fn),
    getActiveViewOfType: () => null,
    getLeavesOfType: type => leaves.filter(leaf => leaf.view?.getViewType?.() === type),
    revealLeaf: async () => {},
    getRightLeaf: () => leaves[0],
  } };
  const plugin = new module.exports.default(app);
  const leaf = { app, detached: false, detach() { this.detached = true; }, async setViewState() { this.view = plugin.factory(this); await this.view.onOpen(); } };
  leaves.push(leaf);
  t.after(async () => { await plugin.controller?.dispose(); dom.window.close(); });
  return { plugin, app, leaf, leaves, events, writes, launches: () => launches };
}

test('Obsidian plugin enablement and restored sidebar never launch a CLI or persist content', async t => {
  const { plugin, leaf, launches, writes } = create(t);
  await plugin.onload();
  await leaf.setViewState();
  assert.equal(launches(), 0);
  assert.equal(plugin.controller.state, 'not-started');
  plugin.controller.setDraft('private draft');
  await plugin.savePath('/fixture/new-path');
  assert.deepEqual(writes, [{ executablePath: '/fixture/new-path' }]);
  await leaf.view.onClose();
  assert.equal(plugin.controller, null);
  assert.equal(launches(), 0);
});

test('restored duplicate view detaches itself and does not close the first owner', async t => {
  const { plugin, leaf, app, launches } = create(t);
  await plugin.onload();
  await leaf.setViewState();
  const owner = plugin.controller;
  const duplicateLeaf = { app, detach() { this.detached = true; } };
  const duplicate = plugin.factory(duplicateLeaf);
  await duplicate.onOpen();
  await duplicate.onClose();
  assert.equal(duplicateLeaf.detached, true);
  assert.equal(plugin.controller, owner);
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
  assert.equal(plugin.controller, null);
  assert.equal(launches(), 0);
});

test('note navigation uses Obsidian API and refuses links to another vault', async t => {
  const { plugin, app, leaf, launches } = create(t);
  const opened = [];
  app.vault.getName = () => 'Studio';
  app.workspace.openLinkText = async (...args) => { opened.push(args); };
  await plugin.onload();
  await leaf.setViewState();
  const open = leaf.view.panel.actions.openNote;
  await open('Notes/Example#Heading', 'Projects/source.md', true);
  await open({ path: 'Notes/Other', vault: 'Studio' }, '', false);
  await assert.rejects(open({ path: 'Private', vault: 'Different' }, '', false));
  assert.deepEqual(opened, [
    ['Notes/Example#Heading', 'Projects/source.md', true],
    ['Notes/Other', '', false],
  ]);
  assert.equal(launches(), 0);
});
