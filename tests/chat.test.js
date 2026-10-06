import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ChatController } from '../src/chat.js';
import { composePrompt, captureSelection, captureFile } from '../src/draft.js';
import { LIMITS, OperationalError } from '../src/limits.js';
import { FrameReader } from '../src/acp.js';

class Session extends EventEmitter {
  constructor() { super(); this.permissions = new Map(); this.sent = []; this.retainedBytes = 0; }
  async start() { this.emit('state', 'ready'); return { identity: { name: 'fixture', version: '3' } }; }
  prompt(text) {
    this.sent.push(text);
    this.emit('state', 'working');
    return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
  }
  complete() { this.emit('state', 'ready'); this.resolve({ stopReason: 'end_turn' }); }
  async close() { this.closed = true; this.permissions.clear(); this.reject?.(new OperationalError('SESSION_CLOSED')); return this.uncertain ? false : undefined; }
  fail(code) { this.emit('state', 'failed'); this.emit('failure', code); }
  stop() { this.permissions.clear(); this.emit('state', 'stopping'); }
}
function create() {
  const session = new Session();
  let launches = 0;
  const controller = new ChatController('/fixture-vault', {
    validate: async () => {}, launch: () => { launches++; return {}; }, createSession: () => session,
  });
  return { controller, session, launches: () => launches };
}
const selected = Object.freeze({ path: 'notes/example.md', from: 2, to: 3, text: '<img src="https://never.test"> exact selection' });

test('first send with a saved executable starts once, then sends after ACP is ready', async () => {
  const { controller, session, launches } = create();
  controller.setDraft('hello');
  const sending = controller.send('/fixture');
  const duplicate = controller.send('/fixture');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(launches(), 1);
  assert.deepEqual(session.sent, ['hello']);
  session.complete();
  await Promise.all([sending, duplicate]);
});

test('auto-start preserves draft on failure and does not start for an empty or oversized prompt', async () => {
  const { controller, launches } = create();
  await controller.send('/fixture');
  controller.setDraft('x'.repeat(LIMITS.prompt + 1));
  await controller.send('/fixture');
  assert.equal(launches(), 0);
  controller.validate = async () => { throw new OperationalError('EXECUTABLE_NOT_AVAILABLE'); };
  controller.setDraft('keep this');
  await controller.send('/fixture');
  assert.equal(controller.draft, 'keep this');
  assert.equal(controller.messages.length, 0);
  assert.match(controller.error, /Settings/);
});

test('reset, closure and draft changes during auto-start never send an old prompt', async () => {
  for (const action of ['reset', 'close', 'edit']) {
    const { controller, session } = create();
    let resume;
    controller.validate = () => new Promise(resolve => { resume = resolve; });
    controller.setDraft('original');
    const sending = controller.send('/fixture');
    if (action === 'reset') await controller.newChat();
    else if (action === 'close') await controller.dispose();
    else controller.setDraft('new draft');
    resume();
    await sending;
    assert.deepEqual(session.sent, []);
    if (action === 'edit') assert.equal(controller.draft, 'new draft');
    await controller.dispose();
  }
});

test('only explicit Start launches; typing, attaching and removing launch nothing', async () => {
  const { controller, launches } = create();
  controller.setDraft('draft');
  controller.attach(selected);
  controller.removeSelection();
  assert.equal(launches(), 0);
  await controller.send();
  assert.equal(launches(), 0);
  await controller.start('/fixture');
  await controller.start('/fixture');
  assert.equal(launches(), 1);
});

test('selection-only send transmits exactly the captured snapshot and never automatically retries', async () => {
  const { controller, session } = create();
  await controller.start('/fixture');
  controller.attach(selected);
  const sending = controller.send();
  assert.equal(session.sent.length, 1);
  assert.ok(session.sent[0].includes(selected.text));
  assert.ok(session.sent[0].includes('notes/example.md'));
  session.reject(new OperationalError('TRANSPORT_LOST'));
  await sending;
  assert.equal(controller.selection, selected);
  assert.match(controller.error, /uncertain/);
  assert.equal(session.sent.length, 1);
});

test('successful send clears old attachment but preserves a new unsent draft', async () => {
  const { controller, session } = create();
  await controller.start('/fixture');
  controller.setDraft('first');
  controller.attach(selected);
  const sending = controller.send();
  controller.setDraft('next draft');
  session.complete();
  await sending;
  assert.equal(controller.draft, 'next draft');
  assert.equal(controller.selection, null);
  assert.equal(controller.messages[0].text, composePrompt('first', selected));
});

test('removed selections never enter outgoing prompts', async () => {
  const { controller, session } = create();
  await controller.start('/fixture');
  controller.setDraft('only this');
  controller.attach(selected);
  controller.removeSelection();
  const sending = controller.send();
  session.complete();
  await sending;
  assert.equal(session.sent[0], 'only this');
});

test('whole-note snapshot captures unsaved content explicitly and enforces the prompt limit', () => {
  let reads = 0;
  const view = { file: { path: 'notes/full.md', extension: 'md' }, editor: {
    getValue: () => { reads++; return 'full unsaved note'; },
  } };
  assert.throws(() => captureFile(view, () => false), { code: 'OPEN_NOTE_FIRST' });
  assert.equal(reads, 0);
  const snapshot = captureFile(view, () => true);
  view.file.path = 'other.md';
  assert.ok(Object.isFrozen(snapshot));
  assert.equal(snapshot.path, 'notes/full.md');
  assert.match(composePrompt('question', snapshot), /^question\n\nAttached note \(notes\/full.md\)/);
  view.editor.getValue = () => 'x'.repeat(LIMITS.prompt);
  assert.throws(() => captureFile(view, () => true), { code: 'PROMPT_LIMIT' });
});

test('file context sends the captured contents and is excluded after removal', async () => {
  const { controller, session } = create();
  await controller.start('/fixture');
  const snapshot = Object.freeze({ kind: 'file', path: 'full.md', text: 'captured full note' });
  controller.attach(snapshot);
  const sending = controller.send();
  assert.equal(session.sent[0], composePrompt('', snapshot));
  assert.ok(Number.isFinite(controller.messages[0].timestamp));
  session.complete();
  await sending;
  controller.attach(snapshot);
  controller.removeSelection();
  controller.setDraft('just my question');
  const next = controller.send();
  assert.equal(session.sent[1], 'just my question');
  session.complete();
  await next;
});

test('closing during executable validation prevents a late launch', async () => {
  let resume;
  let launches = 0;
  const controller = new ChatController('/fixture', {
    validate: () => new Promise(resolve => { resume = resolve; }),
    launch: () => { launches++; },
  });
  const starting = controller.start('/fixture');
  await controller.dispose();
  resume();
  await starting;
  assert.equal(launches, 0);
});

test('New chat discards content and invalidates a pending prompt', async () => {
  const { controller, session } = create();
  await controller.start('/fixture');
  controller.setDraft('old');
  controller.attach(selected);
  const sending = controller.send();
  await controller.newChat();
  await sending;
  assert.equal(controller.state, 'not-started');
  assert.equal(controller.session, null);
  assert.equal(controller.draft, '');
  assert.equal(controller.selection, null);
  assert.deepEqual(controller.messages, []);
  assert.equal(session.closed, true);
});

test('uncertain cleanup blocks a second process and remains recoverable on reopen', async () => {
  const { controller, session, launches } = create();
  await controller.start('/fixture');
  session.uncertain = true;
  assert.equal(await controller.newChat(), false);
  await controller.start('/fixture');
  assert.equal(launches(), 1);
  assert.equal(controller.forceAvailable, true);
  assert.equal(await controller.dispose(), false);
  controller.recoverCleanup();
  assert.equal(controller.state, 'failed');
  assert.equal(controller.activePermission(), null);
  assert.match(controller.error, /cleanup/);
});

test('captures only selected text; revalidates identity and never reads a whole note', () => {
  let selections = 0;
  const view = { file: { path: 'note.md', extension: 'md' }, editor: {
    getSelection: () => { selections++; return 'only chosen text'; },
    getCursor: which => which === 'from' ? { line: 3, ch: 2 } : { line: 5, ch: 0 },
    getValue: () => assert.fail('whole note read'),
  } };
  const snapshot = captureSelection(view, value => value === view);
  assert.deepEqual(snapshot, { path: 'note.md', from: 4, to: 5, text: 'only chosen text' });
  view.file.path = 'changed.md';
  assert.equal(snapshot.path, 'note.md');
  assert.equal(selections, 1);
  assert.throws(() => captureSelection(view, () => false), { code: 'SELECT_TEXT_FIRST' });
  assert.equal(selections, 1);
});

test('combined UTF-8 limit includes labels and refuses oversize without replacing attachment', () => {
  const { controller } = create();
  controller.attach(selected);
  assert.throws(() => controller.attach({ ...selected, text: '🐶'.repeat(LIMITS.prompt / 4) }), { code: 'PROMPT_LIMIT' });
  assert.equal(controller.selection, selected);
  controller.setDraft('x'.repeat(LIMITS.prompt));
  assert.throws(() => composePrompt(controller.draft, selected), { code: 'PROMPT_LIMIT' });
});

test('tool updates merge without clearing omitted data; transcript order stays stable', () => {
  const { controller } = create();
  controller.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'first' } });
  controller.update({ sessionUpdate: 'tool_call', toolCallId: 't', title: 'Tool', rawInput: { args: ['one two', 'three'] } });
  controller.update({ sessionUpdate: 'tool_call_update', toolCallId: 't', status: 'completed', rawInput: null });
  controller.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'second' } });
  assert.deepEqual(controller.messages.map(message => message.role), ['agent', 'tool', 'agent']);
  assert.deepEqual(controller.tools.get('t').data.rawInput.args, ['one two', 'three']);
});

test('deep tool output stays within its compact budget and preserves all supplied data', async () => {
  const { controller, session } = create();
  await controller.start('/fixture');
  let output = Array(2048).fill(null);
  for (let depth = 0; depth < 50; depth++) output = [output];
  const update = { sessionUpdate: 'tool_call_update', toolCallId: 'nested', rawOutput: output };
  const frame = { jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'fixture', update } };
  const wire = Buffer.from(JSON.stringify(frame) + '\n');
  const compactBytes = Buffer.byteLength(JSON.stringify(update));
  // Leave room for the compact display but not the former indentation expansion.
  session.retainedBytes = wire.length;
  controller.uiBytes = LIMITS.session - wire.length - compactBytes - 1;
  new FrameReader(received => controller.update(received.params.update)).push(wire);
  assert.equal(controller.state, 'ready');
  assert.equal(controller.messages.length, 1);
  assert.deepEqual(JSON.parse(controller.messages[0].text), update);
  assert.equal(controller.uiBytes + session.retainedBytes, LIMITS.session - 1);

  // Compact rendering still refuses an update that exceeds the combined budget.
  controller.update({ sessionUpdate: 'tool_call_update', toolCallId: 'nested', status: 'completed' });
  assert.equal(controller.state, 'failed');
  assert.match(controller.error, /memory budget/);
  assert.equal(controller.messages.length, 1);
  assert.equal(controller.tools.get('nested').data.status, undefined);
});
