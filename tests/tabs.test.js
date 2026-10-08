import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM } from 'jsdom';
import { ChatTabs, TabbedPanel } from '../src/tabs.js';
import { ChatController } from '../src/chat.js';

const byName = (root, name) => [...root.querySelectorAll('button')].find(button => button.textContent === name) ?? null;

class Chat extends EventEmitter {
  constructor(id) { super(); this.id = id; this.messages = []; this.draft = ''; this.state = 'not-started'; this.title = ''; this.clean = true; }
  async dispose() { this.disposed = true; this.removeAllListeners(); return this.clean; }
  recoverCleanup() { this.recovered = true; this.disposed = false; }
  setError(code) { this.error = code; }
}
const make = limit => {
  let count = 0;
  return new ChatTabs(() => new Chat(++count), limit);
};

test('tabs add up to the limit, select, and close to a neighbour; the last tab is replaced', async () => {
  const tabs = make(3);
  const [a, b, c] = [tabs.add(), tabs.add(), tabs.add()];
  assert.equal(tabs.add(), null);
  assert.equal(tabs.active, c);
  tabs.select(a);
  assert.equal(tabs.active, a);
  assert.equal(await tabs.close(a), true);
  assert.equal(a.disposed, true);
  assert.equal(tabs.active, b);
  await tabs.close(b);
  await tabs.close(c);
  assert.equal(tabs.chats.length, 1);
  assert.notEqual(tabs.active, c);
});

test('a chat whose cleanup is uncertain stays open for recovery; dispose keeps only those', async () => {
  const tabs = make(5);
  const [a, b] = [tabs.add(), tabs.add()];
  a.clean = false;
  assert.equal(await tabs.close(a), false);
  assert.equal(a.recovered, true);
  assert.ok(tabs.chats.includes(a));
  let changes = 0;
  tabs.on('change', () => changes++);
  a.emit('change');
  assert.equal(changes, 1, 'a recovered chat still reports changes');
  assert.equal(await tabs.dispose(), false);
  assert.deepEqual(tabs.chats, [a]);
  assert.equal(b.disposed, true);
  tabs.recover();
  assert.equal(tabs.disposed, false);
});

test('tab strip shows one panel per chat and asks before closing a chat with content', async t => {
  const dom = new JSDOM('<main></main>');
  const tabs = new ChatTabs(() => new ChatController('/fixture-vault'), 2);
  tabs.add();
  let asked = 0;
  const root = dom.window.document.querySelector('main');
  const view = new TabbedPanel(root, tabs, {
    getPath: () => '', savePath: async () => {}, attachSelection: async () => {}, attachFile: async () => {},
    copyText: async () => {}, confirmClose: async () => { asked++; return false; },
  });
  t.after(async () => { view.dispose(); await tabs.dispose(); dom.window.close(); });
  const add = root.querySelector('.sir-scribbles-tab-add');
  add.click();
  assert.equal(root.querySelectorAll('[role="tab"]').length, 2);
  assert.equal(add.disabled, true);
  const panes = root.querySelectorAll('[role="tabpanel"]');
  assert.deepEqual([...panes].map(pane => pane.hidden), [true, false]);
  assert.equal(root.querySelector('.sir-scribbles-reset'), null, 'tabs replace the in-panel reset');
  root.querySelector('[role="tab"]').click();
  view.render();
  assert.deepEqual([...panes].map(pane => pane.hidden), [false, true]);
  tabs.active.setDraft('unsent');
  byName(root, 'Close chat').click();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(asked, 1);
  assert.equal(tabs.chats.length, 2);
  tabs.active.setDraft('');
  byName(root, 'Close chat').click();
  await new Promise(resolve => setTimeout(resolve, 10));
  view.render();
  assert.equal(asked, 1);
  assert.equal(root.querySelectorAll('[role="tab"]').length, 1);
  assert.equal(root.querySelectorAll('[role="tabpanel"]').length, 1);
});

test('closing a tab with uncertain cleanup shows Force stop in a live panel', async t => {
  const dom = new JSDOM('<main></main>');
  const tabs = new ChatTabs(() => new ChatController('/fixture-vault'), 2);
  const chat = tabs.add();
  chat.state = 'ready';
  chat.dispose = async () => { chat.disposed = true; chat.removeAllListeners(); return false; };
  const root = dom.window.document.querySelector('main');
  const view = new TabbedPanel(root, tabs, {
    getPath: () => '/fixture/kiro', savePath: async () => {}, attachSelection: async () => {}, attachFile: async () => {},
    copyText: async () => {}, confirmClose: async () => true,
  });
  t.after(() => { view.dispose(); dom.window.close(); });
  byName(root, 'Close chat').click();
  await new Promise(resolve => setTimeout(resolve, 10));
  const force = [...root.querySelectorAll('button')].find(button => button.textContent === 'Force stop agent');
  assert.equal(force.hidden, false);
  assert.match(root.querySelector('.sir-scribbles-error').textContent, /cleanup could not be confirmed/);
  assert.equal(root.querySelector('.sir-scribbles-status').textContent, 'Failed');
  chat.error = 'later update';
  chat.changed();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.match(root.querySelector('.sir-scribbles-error').textContent, /later update/);
});
