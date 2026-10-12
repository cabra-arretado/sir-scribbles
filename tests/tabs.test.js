import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM } from 'jsdom';
import { ChatTabs, TabbedPanel } from '../src/tabs.js';
import { ChatController } from '../src/chat.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AcpSession } from '../src/acp.js';
import { LIMITS } from '../src/limits.js';

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

test('the tab strip has no tooltip of its own', t => {
  const dom = new JSDOM('<main></main>');
  const tabs = new ChatTabs(() => new ChatController('/fixture-vault'), 2);
  tabs.add();
  const root = dom.window.document.querySelector('main');
  const view = new TabbedPanel(root, tabs, { getPath: () => '', savePath: async () => {}, attachSelection: async () => {}, attachFile: async () => {}, copyText: async () => {}, confirmClose: async () => true });
  t.after(async () => { view.dispose(); await tabs.dispose(); dom.window.close(); });
  assert.equal(view.strip.hasAttribute('aria-label'), false);
  assert.equal(root.querySelector('.sir-scribbles-tab-add').getAttribute('aria-label'), 'New chat');
});

// Exercise two real JSON-RPC transports: both fixtures deliberately use the
// same session/tool IDs, so process isolation must keep their events separate.
const fixture = fileURLToPath(new URL('./fixtures/agent.js', import.meta.url));
const tick = () => new Promise(resolve => setImmediate(resolve));
function realTabs(t, modes, limit = 5) {
  let launches = 0;
  const tabs = new ChatTabs(() => new ChatController('/fixture', {
    validate: async () => {},
    launch: () => spawn(process.execPath, [fixture, modes[launches++] ?? 'normal'], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] }),
    createSession: child => new AcpSession(child, { limits: { ...LIMITS, startupMs: 1000, shutdownMs: 200 } }),
  }), limit);
  t.after(() => tabs.dispose());
  return { tabs, launches: () => launches };
}

test('parallel draft starts a separate session with the selected agent while the source keeps working', async t => {
  const { tabs, launches } = realTabs(t, ['agents-hang', 'agents']);
  const source = tabs.add();
  await source.start('/fixture-agent');
  await source.setMode('reviewer');
  // A single advertised profile still needs to be carried to the new process.
  source.session.setConfigOptions(source.configOptions.map(option => option.category === 'mode'
    ? { ...option, options: option.options.filter(entry => entry.value === 'reviewer') } : option));
  source.setDraft('Main task');
  const main = source.send();
  assert.equal(source.state, 'working');
  source.setDraft('Independent review');
  source.attach({ path: 'note.md', from: 1, to: 1, text: 'Explicit context' });
  const child = await tabs.runParallel(source, '/fixture-agent');
  assert.equal(launches(), 2);
  assert.equal(tabs.active, child);
  assert.notEqual(source.session.child.pid, child.session.child.pid);
  assert.equal(child.modeOption().currentValue, 'reviewer');
  assert.equal(source.state, 'working');
  assert.equal(child.state, 'ready');
  assert.ok(child.messages[0].text.includes('Independent review'));
  assert.ok(child.messages[0].text.includes('Explicit context'));
  assert.ok(!child.messages[0].text.includes('Main task'));
  assert.equal(source.messages.length, 1);
  assert.equal(source.draft, '');
  source.stop();
  await main;
  assert.equal(child.state, 'ready');
});

test('parallel startup failure retains the task in the new tab; an unavailable mode sends nothing', async t => {
  const { tabs } = realTabs(t, ['agents', 'agents-reject']);
  const source = tabs.add();
  await source.start('/fixture-agent');
  await source.setMode('reviewer');
  source.setDraft('Keep this task');
  const child = await tabs.runParallel(source, '/fixture-agent');
  assert.equal(child.draft, 'Keep this task');
  assert.equal(child.messages.length, 0);
  assert.match(child.error, /did not change the setting/);
  assert.equal(source.state, 'ready');

  source.setDraft('Missing profile');
  const missing = await tabs.runParallel(source, '/fixture-agent');
  assert.equal(missing.messages.length, 0);
  assert.equal(missing.draft, 'Missing profile');
  assert.match(missing.error, /did not confirm the selected agent/);
});

test('parallel action refuses a full tab set, invalid draft or pending file read without losing the draft', async t => {
  const { tabs, launches } = realTabs(t, ['normal'], 1);
  const source = tabs.add();
  await source.start('/fixture-agent');
  source.setDraft('Keep');
  assert.equal(await tabs.runParallel(source, '/fixture-agent'), null);
  assert.equal(source.draft, 'Keep');
  assert.equal(launches(), 1);
  tabs.limit = 2;
  source.reading = 1;
  assert.equal(tabs.canRunParallel(source), false);
  assert.equal(await tabs.runParallel(source, '/fixture-agent'), null);
  source.reading = 0;
  source.setDraft('x'.repeat(LIMITS.prompt + 1));
  assert.equal(await tabs.runParallel(source, '/fixture-agent'), null);
  assert.equal(tabs.chats.length, 1);
  assert.equal(launches(), 1);
  assert.equal(source.draft.length, LIMITS.prompt + 1);
});

test('edits during parallel startup are kept for review and are never sent automatically', async t => {
  const { tabs } = realTabs(t, ['normal', 'normal']);
  const source = tabs.add();
  await source.start('/fixture-agent');
  source.setDraft('Original');
  const run = tabs.runParallel(source, '/fixture-agent');
  const child = tabs.active;
  child.setDraft('Edited while starting');
  await run;
  assert.equal(child.messages.length, 0);
  assert.equal(child.draft, 'Edited while starting');
  assert.match(child.error, /draft changed/);
});

test('cancelling the parallel task does not cancel the source task', async t => {
  const { tabs } = realTabs(t, ['hang', 'hang']);
  const source = tabs.add();
  await source.start('/fixture-agent');
  source.setDraft('Source task');
  const main = source.send();
  source.setDraft('Parallel task');
  const parallel = tabs.runParallel(source, '/fixture-agent');
  const child = tabs.active;
  await new Promise(resolve => {
    child.on('change', function ready() {
      if (child.state === 'working') { child.off('change', ready); resolve(); }
    });
  });
  // Give the fixture its prompt before asking for cancellation.
  await tick();
  child.stop();
  await parallel;
  assert.equal(child.state, 'ready');
  assert.equal(source.state, 'working');
  source.stop();
  await main;
});

test('resetting and restarting a parallel tab during validation never sends the old task into the replacement session', async t => {
  const { tabs } = realTabs(t, ['normal', 'normal']);
  const source = tabs.add();
  await source.start('/fixture-agent');
  let release;
  const validating = new Promise(resolve => { release = resolve; });
  const create = tabs.createChat;
  tabs.createChat = () => {
    const chat = create();
    chat.validate = () => validating;
    return chat;
  };
  source.setDraft('Old task');
  const run = tabs.runParallel(source, '/fixture-agent');
  const child = tabs.active;
  await child.newChat();
  child.validate = async () => {};
  child.setDraft('Replacement draft');
  await child.start('/fixture-agent');
  release();
  await run;
  assert.equal(child.draft, 'Replacement draft');
  assert.equal(child.messages.length, 0);
});

test('a failed parallel executable validation keeps draft and attachments in the new tab', async t => {
  const { tabs, launches } = realTabs(t, ['normal']);
  const source = tabs.add();
  await source.start('/fixture-agent');
  const create = tabs.createChat;
  tabs.createChat = () => {
    const chat = create();
    chat.validate = async () => { throw Object.assign(new Error(), { code: 'EXECUTABLE_NOT_AVAILABLE' }); };
    return chat;
  };
  source.setDraft('Recover me');
  source.attach({ kind: 'file', path: 'note.md' });
  const child = await tabs.runParallel(source, '/missing-agent');
  assert.equal(child.draft, 'Recover me');
  assert.equal(child.file.path, 'note.md');
  assert.equal(child.messages.length, 0);
  assert.equal(child.state, 'not-started');
  assert.equal(launches(), 1);
});

test('fork control appears only for a started chat with a draft and explains the shared tab limit', async t => {
  const dom = new JSDOM('<main></main>');
  const tabs = new ChatTabs(() => new ChatController('/fixture-vault'), 2);
  const source = tabs.add();
  const root = dom.window.document.querySelector('main');
  const view = new TabbedPanel(root, tabs, {
    getPath: () => '/fixture/kiro', savePath: async () => {}, attachSelection: async () => {}, attachFile: async () => {},
    copyText: async () => {}, confirmClose: async () => true,
  });
  t.after(async () => { view.dispose(); await tabs.dispose(); dom.window.close(); });
  const panel = view.entries.get(source).panel;
  assert.equal(panel.parallel.hidden, true);
  source.setDraft('Task');
  panel.renderControls();
  assert.equal(panel.parallel.hidden, true, 'an unstarted chat has no fork control');
  source.state = 'ready';
  panel.renderControls();
  assert.equal(panel.parallel.hidden, false);
  assert.equal(panel.parallel.disabled, false);
  assert.equal(panel.parallel.parentElement, panel.send.parentElement);
  assert.equal(panel.parallel.parentElement, panel.stop.parentElement);
  assert.notEqual(panel.parallel.parentElement, panel.attach.parentElement);
  assert.equal(panel.modelPicker.parentElement, panel.attach.parentElement, 'pickers stay inline in the toolbar');
  const other = tabs.add();
  view.render();
  assert.equal(panel.parallel.hidden, false);
  assert.equal(panel.parallel.disabled, true);
  assert.match(panel.parallel.title, /Up to 2 chats.*Close one/);
  await tabs.close(other);
  view.render();
  assert.equal(panel.parallel.disabled, false, 'closing another tab updates source capacity');
  source.setDraft('');
  panel.renderControls();
  assert.equal(panel.parallel.hidden, true);
  source.file = { kind: 'file', path: 'note.md' };
  source.state = 'working';
  panel.renderControls();
  assert.equal(panel.parallel.hidden, false, 'explicit context counts as a draft during a turn');
});
