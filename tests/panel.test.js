import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ChatController } from '../src/chat.js';
import { ChatPanel } from '../src/panel.js';

function create(t, { frames = false } = {}) {
  const dom = new JSDOM('<main></main>', { url: 'https://fixture.test' });
  // Controlled animation frames: `frame()` runs the pending callbacks once.
  const pending = new Map();
  let frameId = 0;
  let clock = 0;
  if (frames) {
    dom.window.requestAnimationFrame = callback => { pending.set(++frameId, callback); return frameId; };
    dom.window.cancelAnimationFrame = id => { pending.delete(id); };
  }
  const frame = (ms = 16) => {
    clock += ms;
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) callback(clock);
  };
  const model = new ChatController('/fixture-vault');
  let attached = 0;
  let copied = '';
  const root = dom.window.document.querySelector('main');
  const panel = new ChatPanel(root, model, {
    getPath: () => '/fixture/kiro', savePath: async () => {},
    attachSelection: async () => { attached++; return Object.freeze({ path: 'note.md', from: 1, to: 2, text: '<script>evil()</script>\n![remote](https://never.test/p.png)' }); },
    attachFile: async () => Object.freeze({ kind: 'file', path: 'whole.md' }),
    confirmReset: async () => true,
    copyText: async text => { copied = text; },
  });
  t.after(() => { panel.dispose(); dom.window.close(); });
  return { dom, model, root, panel, frame, pending, attached: () => attached, copied: () => copied };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 50));

test('opening panel never starts the agent and initial controls express state', t => {
  const { panel, root, model } = create(t);
  assert.equal(model.session, null);
  assert.equal(panel.status.textContent, 'Not started');
  assert.equal(panel.start.disabled, false);
  assert.equal(panel.send.disabled, true);
  assert.equal(panel.stop.hidden, true);
  assert.ok(root.textContent.includes('Kiro CLI (V3) is currently the only supported agent'));
});

test('HTML, remote-media syntax, terminal escapes and tool input render as inert text', t => {
  const { model, root, panel } = create(t);
  const payload = '<img src="https://never.test/x" onerror="evil()"><script>evil()</script>\u001b[31m';
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: payload } });
  model.update({ sessionUpdate: 'tool_call', toolCallId: 't', title: '<b>Run</b>', rawInput: { args: ['$(evil)', 'two words'] } });
  panel.render();
  assert.ok(root.textContent.includes(payload));
  assert.equal(panel.transcript.querySelectorAll('img:not(.sir-scribbles-empty-mark), script, a, iframe, audio, video').length, 0);
  assert.ok(root.textContent.includes('two words'));
});

test('selection preview is complete and removable; replacement is explicit', async t => {
  const { panel, model, attached, root } = create(t);
  panel.attach.click();
  await tick();
  assert.equal(attached(), 1);
  assert.ok(root.textContent.includes(model.selection.text));
  assert.equal(panel.attach.getAttribute('aria-pressed'), 'true');
  assert.equal(panel.selectionArea.querySelectorAll('script, img').length, 0);
  assert.equal(panel.selectionArea.querySelector('details').open, false);
  root.querySelector('[aria-label="Remove selection"]').click();
  await tick();
  assert.equal(model.selection, null);
  assert.equal(panel.selectionArea.hidden, true);
});

test('ID-only permission shows fallback details and leaves the choice to the user', t => {
  const { model, panel, root } = create(t);
  const card = { id: 8, params: { toolCall: { toolCallId: 'replace' } }, options: [
    { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
    { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
  ] };
  model.session = { permissions: new Map([[8, card]]) };
  model.state = 'waiting-for-approval';
  panel.render();
  assert.equal(panel.permissionArea.hidden, false);
  assert.ok(root.textContent.includes('Tool replace'));
  assert.ok(root.textContent.includes('Tool arguments were not supplied'));
  assert.equal(root.querySelectorAll('.sir-scribbles-decisions button').length, 2);
  assert.equal(model.session.permissions.size, 1);
});

test('one-time approval buttons use original IDs, omit persistent choices and reject stale cards', t => {
  const { model, panel, root } = create(t);
  const card = { id: 7, params: {
    toolCall: { title: 'Write <b>file</b>', kind: 'edit', rawInput: { path: '/sensitive', contents: '<script>hi()</script>' } },
  }, options: [{ optionId: 'actual-allow', name: 'Allow', kind: 'allow_once' }, { optionId: 'actual-deny', name: 'Deny', kind: 'reject_once' }],
  unrecognized: ['_meta.kiro.consent.scope'] };
  let decided;
  model.session = { permissions: new Map([[7, card]]), decide: (id, option) => { decided = [id, option]; model.session.permissions.clear(); return true; } };
  model.state = 'waiting-for-approval';
  panel.render();
  const buttons = [...root.querySelectorAll('.sir-scribbles-decisions button')];
  assert.equal(buttons.length, 2);
  assert.ok(root.textContent.includes('/sensitive'));
  assert.ok(root.textContent.includes('Unrecognized approval metadata: _meta.kiro.consent.scope.'));
  assert.equal(root.querySelectorAll('b, script').length, 0);
  buttons[0].click();
  assert.deepEqual(decided, [7, 'actual-allow']);
  assert.equal(buttons.every(button => button.disabled), true);
  decided = null;
  buttons[1].click();
  assert.equal(decided, null);
});

test('Enter sends only when ready; Shift+Enter and IME composition do not send', t => {
  const { model, panel, dom } = create(t);
  let sent = 0;
  model.send = () => { sent++; };
  model.state = 'ready';
  panel.composer.value = 'hello';
  panel.composer.dispatchEvent(new dom.window.Event('input'));
  panel.composer.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.equal(sent, 1);
  panel.composer.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
  panel.composer.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
  panel.composer.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', repeat: true }));
  assert.equal(sent, 1);
  panel.composer.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
  assert.equal(sent, 2);
  model.state = 'working';
  panel.render();
  panel.composer.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
  assert.equal(sent, 2);
});

test('file path appears above the composer and can be replaced or toggled off', async t => {
  const { panel, model, root } = create(t);
  panel.attachFile.click();
  await tick();
  assert.equal(model.file.kind, 'file');
  assert.ok(root.textContent.includes('whole.md'));
  assert.equal(panel.attachFile.getAttribute('aria-pressed'), 'true');
  assert.equal(panel.selectionArea.querySelector('pre'), null);
  assert.ok(panel.composer.compareDocumentPosition(panel.selectionArea) & 2);
  panel.attachFile.click();
  await tick();
  assert.equal(model.file, null);
  assert.equal(panel.attachFile.getAttribute('aria-pressed'), 'false');
  panel.attachFile.click();
  await tick();
  assert.equal(root.querySelectorAll('script').length, 0);
  assert.equal(model.session, null);
  panel.attach.click();
  await tick();
  assert.equal(model.selection.kind, undefined);
  assert.equal(model.file.path, 'whole.md');
  model.removeSelection();
  panel.render();
  assert.equal(panel.selectionArea.hidden, false);
  model.removeFile();
  panel.render();
  assert.equal(panel.selectionArea.hidden, true);
});

test('message timestamps stay stable through streaming', t => {
  const { panel, model, root } = create(t);
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'one' } });
  panel.render();
  const timestamp = root.querySelector('time');
  assert.equal(timestamp.dateTime, new Date(model.messages[0].timestamp).toISOString());
  assert.ok(timestamp.textContent);
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'two' } });
  panel.render();
  assert.equal(root.querySelector('time'), timestamp);
});

test('copy preserves exact plain text and streaming retains existing DOM rows', async t => {
  const { model, panel, root, copied } = create(t);
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'one' } });
  panel.render();
  const row = root.querySelector('.sir-scribbles-agent');
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '\ntwo' } });
  panel.render();
  assert.equal(root.querySelector('.sir-scribbles-agent'), row);
  assert.equal(row.querySelector('.sir-scribbles-markdown').textContent, 'one\ntwo');
  row.querySelector('button').click();
  await tick();
  assert.equal(copied(), 'one\ntwo');
});

test('bot Markdown renders structure, streams incomplete formatting, and copies original source', async t => {
  const { model, panel, root, copied } = create(t);
  const source = '# Plan\n\n**Bold** and *italic* with `code`.\n\n- First\n- Second\n\n> Quote\n\n```js\nconst x = "<img>";\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[Docs](https://example.com)\n\n**unfinished';
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: source } });
  panel.render();
  const row = root.querySelector('.sir-scribbles-agent');
  assert.equal(row.querySelector('h1').textContent, 'Plan');
  assert.equal(row.querySelector('strong').textContent, 'Bold');
  assert.equal(row.querySelector('em').textContent, 'italic');
  assert.equal(row.querySelectorAll('li').length, 2);
  assert.ok(row.querySelector('blockquote'));
  assert.equal(row.querySelector('pre code').textContent, 'const x = "<img>";\n');
  assert.ok(row.querySelector('table'));
  assert.equal(row.querySelector('a').getAttribute('href'), 'https://example.com');
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '**' } });
  panel.render();
  assert.equal(root.querySelector('.sir-scribbles-agent'), row);
  assert.equal([...row.querySelectorAll('strong')].at(-1).textContent, 'unfinished');
  row.querySelector('button').click();
  await tick();
  assert.equal(copied(), source + '**');
});

test('Markdown cannot execute HTML, load images or activate application links', t => {
  const { model, panel, root } = create(t);
  const source = '<script>alert(1)</script>\n<img src="https://never.test/x">\n\n![image](https://never.test/image)\n\n[x](javascript:alert(1)) [local](file:///tmp/a) [action](obsidian://open?vault=private) [relative](secret.md)';
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: source } });
  panel.render();
  assert.equal(panel.transcript.querySelectorAll('script,img:not(.sir-scribbles-empty-mark),iframe,object,embed,svg').length, 0);
  assert.ok(root.textContent.includes('<script>alert(1)</script>'));
  assert.ok(root.textContent.includes('![image](https://never.test/image)'));
  assert.equal(root.querySelectorAll('a[href]').length, 0);
});

test('external links show their destination host and full address', t => {
  const { model, panel } = create(t);
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '[the docs](https://evil.test/?d=secret "Docs") <https://plain.test/>' } });
  panel.render();
  const [disguised, plain] = panel.transcript.querySelectorAll('.sir-scribbles-agent a');
  assert.equal(disguised.nextSibling.textContent, ' (evil.test)');
  assert.equal(disguised.title, 'Docs\nhttps://evil.test/?d=secret');
  assert.equal(plain.nextSibling?.className ?? '', '');
});

test('New chat invalidates a Start awaiting settings save', async t => {
  const { model, panel } = create(t);
  let finishSave;
  let starts = 0;
  panel.actions.getPath = () => '';
  panel.actions.savePath = () => new Promise(resolve => { finishSave = resolve; });
  model.start = () => { starts++; };
  panel.start.click();
  await model.newChat();
  finishSave();
  await tick();
  assert.equal(starts, 0);
  assert.equal(panel.start.disabled, false);
});

test('saved executable starts without reconfirmation and settings changes take effect', async t => {
  const { model, panel } = create(t);
  let saved = '/fixture/kiro';
  const starts = [];
  panel.actions.getPath = () => saved;
  panel.actions.savePath = () => assert.fail('saved path should not be saved again');
  model.start = async path => { starts.push(path); };
  panel.render();
  assert.equal(panel.path.hidden, true);
  panel.path.value = '/ignored/stale-input';
  panel.start.click();
  await tick();
  saved = '/fixture/new-kiro';
  panel.render();
  panel.start.click();
  await tick();
  assert.deepEqual(starts, ['/fixture/kiro', '/fixture/new-kiro']);
});

test('first Send is enabled with a saved executable and forwards it without starting on typing', t => {
  const { model, panel, dom } = create(t);
  const sent = [];
  model.send = path => sent.push(path);
  panel.composer.value = 'first question';
  panel.composer.dispatchEvent(new dom.window.Event('input'));
  assert.deepEqual(sent, []);
  assert.equal(panel.send.disabled, false);
  panel.composer.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.deepEqual(sent, ['/fixture/kiro']);
  panel.actions.getPath = () => '';
  panel.render();
  assert.equal(panel.send.disabled, true);
});

test('wiki and Markdown note links open only on click with the reply source path', t => {
  const { model, panel, root, dom } = create(t);
  const opened = [];
  panel.actions.openNote = (...args) => { opened.push(args); };
  model.turnSourcePath = 'Projects/source.md';
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text:
    '[[Notes/Example#Section|Example]] [Relative](../Notes/Other%20note.md#^block) [URI](obsidian://open?file=Notes%2FExample&vault=Studio) `[[Code]]` ![[Embed]] [Unsafe](obsidian://advanced-uri?vault=x) [Script](javascript:alert(1))' } });
  panel.render();
  assert.equal(opened.length, 0);
  const links = root.querySelectorAll('a.internal-link');
  assert.equal(links.length, 3);
  links[0].click();
  links[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
  links[2].click();
  assert.deepEqual(opened, [
    ['Notes/Example#Section', 'Projects/source.md', false],
    ['../Notes/Other note.md#^block', 'Projects/source.md', true],
    [{ path: 'Notes/Example', vault: 'Studio' }, 'Projects/source.md', false],
  ]);
  assert.equal(root.querySelector('code').textContent, '[[Code]]');
  assert.ok(root.textContent.includes('![[Embed]]'));
  assert.equal(root.querySelectorAll('a[href^="obsidian:"]').length, 0);
});

test('an animated reply keeps unfinished syntax settled between bursts until the turn ends', t => {
  const { model, panel, root, frame } = create(t, { frames: true });
  model.state = 'working';
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello **bo' } });
  panel.render();
  for (let i = 0; i < 60; i++) frame();
  assert.equal(panel.streaming.size, 0);
  const body = root.querySelector('.sir-scribbles-markdown');
  assert.equal(body.querySelector('strong')?.textContent, 'bo');
  assert.ok(!body.textContent.includes('**'));
  model.state = 'ready';
  model.changed();
  panel.render();
  assert.equal(body.querySelector('strong'), null);
  assert.equal(body.textContent, 'Hello **bo');
});

test('New chat during an animated reply stops animating the discarded row', t => {
  const { model, panel, frame, pending } = create(t, { frames: true });
  model.state = 'working';
  model.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'word '.repeat(4000) } });
  panel.render();
  frame();
  assert.equal(panel.streaming.size, 1);
  model.messages = [];
  model.state = 'not-started';
  panel.render();
  assert.equal(panel.rows.size, 0);
  assert.equal(panel.streaming.size, 0);
  assert.equal(pending.size, 0);
  assert.equal(panel.frame, null);
});

test('model picker appears only when the agent offers models and follows its state', async t => {
  const { model, root, dom } = create(t);
  const picker = root.querySelector('.sir-scribbles-model');
  assert.equal(picker.hidden, true);
  const chosen = [];
  model.session = { permissions: new Map(), setConfigOption: async (id, value) => { chosen.push([id, value]); } };
  model.state = 'ready';
  model.configOptions = [{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'opus', options: [
    { value: 'auto', name: 'Auto', description: 'Picks for you' },
    { value: 'sonnet', name: 'Sonnet', group: 'Claude' },
    { value: 'opus', name: '<b>Opus</b>', group: 'Claude' },
  ] }];
  model.changed();
  await tick();
  assert.equal(picker.hidden, false);
  assert.equal(picker.disabled, false);
  assert.equal(picker.value, 'opus');
  assert.equal(picker.querySelector('optgroup').label, 'Claude');
  assert.equal(picker.querySelectorAll('option').length, 3);
  assert.equal(picker.querySelector('b'), null);
  picker.value = 'auto';
  picker.dispatchEvent(new dom.window.Event('change'));
  await tick();
  assert.deepEqual(chosen, [['model', 'auto']]);
  // The agent did not report a new value, so the picker shows what it still uses.
  assert.equal(picker.value, 'opus');
  model.state = 'working';
  model.changed();
  await tick();
  assert.equal(picker.disabled, true);
});

test('past chats list opens the chosen chat or a new one; replayed rows have no time', t => {
  const { model, panel, root } = create(t);
  const opened = [];
  model.open = async (...args) => { opened.push(args); };
  model.state = 'connected';
  model.history = { pending: true };
  panel.render();
  assert.equal(panel.empty.hidden, true);
  assert.match(panel.historyArea.textContent, /Asking the agent/);
  assert.equal(root.querySelector('.sir-scribbles-history .sir-scribbles-secondary').disabled, true);
  model.history = { entries: [{ sessionId: 'old', title: '<b>Older</b>', updatedAt: Date.UTC(2026, 0, 2) }, { sessionId: 'x', title: '', updatedAt: null }] };
  panel.render();
  const items = root.querySelectorAll('.sir-scribbles-history-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].querySelector('.sir-scribbles-history-title').textContent, '<b>Older</b>');
  assert.equal(items[1].textContent, 'Untitled chat');
  items[0].click();
  root.querySelector('.sir-scribbles-history .sir-scribbles-secondary').click();
  assert.deepEqual(opened, [['old', '<b>Older</b>'], []]);
  model.state = 'ready';
  model.history = null;
  model.messages.push({ role: 'user', text: 'Earlier question', timestamp: null });
  panel.render();
  assert.equal(panel.historyArea.hidden, true);
  assert.equal(panel.transcript.querySelector('.sir-scribbles-user time'), null);
});
