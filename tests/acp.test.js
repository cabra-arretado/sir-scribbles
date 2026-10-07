import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AcpSession, FrameReader, sanitizeConfigOptions } from '../src/acp.js';
import { LIMITS } from '../src/limits.js';
import { validateExecutable, AGENT_ARGS } from '../src/process.js';

const fixture = fileURLToPath(new URL('./fixtures/agent.js', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function create(t, mode = 'normal', overrides = {}) {
  const child = spawn(process.execPath, [fixture, mode], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const session = new AcpSession(child, { limits: { ...LIMITS, startupMs: 1500, shutdownMs: 200, cancellationMs: 30, ...overrides } });
  t.after(async () => { await session.close(); });
  return session;
}

test('byte framing handles fragmented UTF-8 and multiple lines', () => {
  const received = [];
  const reader = new FrameReader(frame => received.push(frame), 64);
  const bytes = Buffer.from('{"text":"🐶"}\n{"x":1}\n');
  for (const byte of bytes) reader.push(Buffer.from([byte]));
  reader.finish();
  assert.deepEqual(received, [{ text: '🐶' }, { x: 1 }]);
});

test('rejects oversized unterminated frames before JSON parsing', () => {
  const reader = new FrameReader(() => assert.fail('must not parse'), 8);
  reader.push(Buffer.from('12345678'));
  assert.throws(() => reader.push(Buffer.from('9')), { code: 'FRAME_LIMIT' });
  assert.throws(() => reader.finish(), { code: 'UNTERMINATED_FRAME' });
});

test('rejects invalid UTF-8, JSON and accepts CRLF', () => {
  const reader = new FrameReader(() => {}, 64);
  assert.throws(() => reader.push(Buffer.from([0xff, 10])), { code: 'INVALID_FRAME' });
  assert.throws(() => reader.push(Buffer.from('{bad}\n')), { code: 'INVALID_FRAME' });
  reader.push(Buffer.from('{}\r\n'));
});

test('validates executable metadata without invocation and fixes launch arguments', async () => {
  await validateExecutable(process.execPath);
  await assert.rejects(validateExecutable('kiro-cli'), { code: 'ABSOLUTE_EXECUTABLE_REQUIRED' });
  await assert.rejects(validateExecutable('/does/not/exist'), { code: 'EXECUTABLE_NOT_AVAILABLE' });
  assert.deepEqual(AGENT_ARGS, ['acp', '--agent-engine=v3', '--auth-method=cli']);
});

test('negotiates disabled execution capabilities and sends ordered plain text', async t => {
  const session = create(t);
  const writes = [];
  const write = session.write.bind(session);
  session.write = frame => { writes.push(frame); write(frame); };
  const updates = [];
  session.on('update', update => updates.push(update));
  await session.start('/fixture');
  assert.deepEqual(writes[0].params.clientCapabilities, { fs: { readTextFile: false, writeTextFile: false }, terminal: false });
  assert.deepEqual(writes[1].params, { cwd: '/fixture', mcpServers: [] });
  const result = await session.prompt('hello');
  assert.equal(result.stopReason, 'end_turn');
  assert.equal(session.state, 'ready');
  assert.deepEqual(updates.filter(update => update.sessionUpdate === 'agent_message_chunk').map(update => update.content.text),
    ['<script>alert(1)</script>\u001b[31m', ' second']);
});

test('offers one active permission; choices are single-use and never persistent', async t => {
  const session = create(t, 'permission');
  await session.start('/fixture');
  const cardReceived = once(session, 'permission');
  const turn = session.prompt('do a thing');
  const [card] = await cardReceived;
  assert.equal(session.decide(card.id, 'forever'), false);
  assert.equal(session.decide(card.id, 'no'), true);
  assert.equal(session.decide(card.id, 'no'), false);
  assert.equal((await turn).stopReason, 'end_turn');
});

test('queued permission cannot be decided before active request', async t => {
  const session = create(t, 'queue');
  await session.start('/fixture');
  const secondCard = new Promise(resolve => session.on('permission', () => { if (session.permissions.size === 2) resolve(); }));
  const turn = session.prompt('two actions');
  await secondCard;
  assert.equal(session.decide(101, 'yes'), false);
  assert.equal(session.decide(100, 'no'), true);
  assert.equal(session.decide(101, 'yes'), true);
  await turn;
});

test('stop cancels permissions and waits for the prompt response', async t => {
  const session = create(t, 'permission');
  await session.start('/fixture');
  const received = once(session, 'permission');
  const turn = session.prompt('permission');
  const [card] = await received;
  const replies = [];
  const write = session.write.bind(session);
  session.write = frame => { replies.push(frame); write(frame); };
  session.stop();
  assert.equal(session.state, 'stopping');
  assert.equal(session.decide(card.id, 'yes'), false);
  assert.equal(session.permissions.size, 0);
  await assert.rejects(session.prompt('no overlap'), { code: 'PROMPT_NOT_AVAILABLE' });
  assert.deepEqual(replies[0].result, { outcome: { outcome: 'cancelled' } });
  await turn;
  assert.equal(session.state, 'ready');
});

test('progress turn_end never completes a prompt; cancellation timeout only offers force', async t => {
  const session = create(t, 'cancel-hang');
  await session.start('/fixture');
  const update = once(session, 'update');
  const turn = session.prompt('long task');
  const rejected = assert.rejects(turn, { code: 'SESSION_CLOSED' });
  await update;
  assert.equal(session.state, 'working');
  const available = once(session, 'force-stop-available');
  session.stop();
  await available;
  assert.equal(session.state, 'stopping');
  await session.close();
  await rejected;
});

for (const [mode, code] of [['duplicate', 'DUPLICATE_PERMISSION'], ['queue-overflow', 'PERMISSION_LIMIT'], ['transport-loss', 'TRANSPORT_LOST'], ['huge-frame', 'FRAME_LIMIT']]) {
  test(`${mode} fails safely with observed cleanup`, async t => {
    const session = create(t, mode, { frame: 4096 });
    await session.start('/fixture');
    const cleanup = once(session, 'cleanup');
    await assert.rejects(session.prompt('test'), { code });
    assert.equal(session.state, 'failed');
    assert.equal(session.permissions.size, 0);
    assert.deepEqual(await cleanup, ['observed']);
  });
}

for (const [mode, code] of [['wrong-version', 'INCOMPATIBLE_PROTOCOL'], ['invalid-json', 'INVALID_FRAME'], ['startup-hang', 'STARTUP_TIMEOUT']]) {
  test(`${mode} fails startup and cleans up`, async t => {
    const session = create(t, mode, { startupMs: mode === 'startup-hang' ? 150 : 1500 });
    await assert.rejects(session.start('/fixture'), { code });
    assert.equal(session.state, 'failed');
    assert.equal(session.child.exitCode !== null || session.child.signalCode !== null, true);
  });
}

test('unsupported filesystem and terminal requests execute nothing and receive protocol errors', async t => {
  const session = create(t, 'client-methods');
  const replies = [];
  const write = session.write.bind(session);
  session.write = frame => { if (frame.error) replies.push(frame); write(frame); };
  await session.start('/fixture');
  await session.prompt('tools');
  assert.deepEqual(replies.map(frame => [frame.id, frame.error.code]), [['fs', -32601], ['terminal', -32601]]);
});

test('rejects oversized prompt without sending or ending ready session', async t => {
  const session = create(t, 'normal', { prompt: 4 });
  await session.start('/fixture');
  await assert.rejects(session.prompt('🐶x'), { code: 'PROMPT_LIMIT' });
  assert.equal(session.state, 'ready');
});

test('session overflow ends session instead of discarding approval data', async t => {
  const session = create(t, 'normal');
  await session.start('/fixture');
  session.limits.session = session.retainedBytes + 6;
  await assert.rejects(session.prompt('hello'), { code: 'SESSION_LIMIT' });
  assert.equal(session.state, 'failed');
});

test('retained stderr is bounded and is not included in errors', async t => {
  const session = create(t, 'stderr', { stderr: 64 });
  await session.start('/fixture');
  await session.prompt('hello');
  await delay(30);
  assert.ok(session.stderr.length <= 64);
  assert.equal(session.stderr.length, 64);
});

test('shutdown escalates a child that ignores SIGTERM', async t => {
  const session = create(t, 'ignore-term');
  await session.start('/fixture');
  const cleanup = once(session, 'cleanup');
  await session.close();
  assert.deepEqual(await cleanup, ['observed']);
  assert.equal(session.child.signalCode, 'SIGKILL');
});

test('stale session permission cancels; duplicate request ID fails closed', async t => {
  const session = create(t);
  await session.start('/fixture');
  const sent = [];
  const write = session.write.bind(session);
  session.write = frame => { sent.push(frame); write(frame); };
  session.permission('stale', { sessionId: 'other' });
  assert.deepEqual(sent[0].result, { outcome: { outcome: 'cancelled' } });
  assert.throws(() => session.permission('stale', { sessionId: 'other' }), { code: 'DUPLICATE_PERMISSION' });
});

test('nesting limit applies before parsing; delimiters in strings do not count', () => {
  const reader = new FrameReader(() => {}, 1024);
  assert.throws(() => reader.push(Buffer.from('['.repeat(65) + '0' + ']'.repeat(65) + '\n')), { code: 'JSON_DEPTH_LIMIT' });
  reader.push(Buffer.from(JSON.stringify({ string: '"\\' + '['.repeat(100) }) + '\n'));
});

test('close during startup settles outstanding request and observes exit', async t => {
  const session = create(t, 'startup-hang');
  const starting = assert.rejects(session.start('/fixture'), { code: 'SESSION_CLOSED' });
  const cleanup = once(session, 'cleanup');
  await session.close();
  await starting;
  assert.deepEqual(await cleanup, ['observed']);
  assert.equal(session.pending.size, 0);
});

test('cleanup tracks grandchildren in the owned group', async t => {
  const session = create(t, 'grandchild', { shutdownMs: 600 });
  const childReported = once(session, 'update');
  await session.start('/fixture');
  const [update] = await childReported;
  assert.equal(update.sessionUpdate, 'fixture-child');
  process.kill(update.pid, 0);
  const cleanup = once(session, 'cleanup');
  await session.close();
  assert.deepEqual(await cleanup, ['observed']);
  assert.throws(() => process.kill(update.pid, 0), { code: 'ESRCH' });
});

test('failed cleanup remains explicitly uncertain', async t => {
  const session = create(t);
  await session.start('/fixture');
  const terminate = session.terminate;
  session.terminate = async child => { await terminate(child, 200); throw new Error('uncertain fixture'); };
  const cleanup = once(session, 'cleanup');
  assert.equal(await session.close(), false);
  assert.deepEqual(await cleanup, ['uncertain']);
});

test('partial replace-string permission merges earlier details and waits for a user decision', async t => {
  const session = create(t);
  await session.start('/fixture');
  session.setState('working');
  const writes = [];
  session.write = frame => writes.push(frame);
  const update = toolCall => session.receive({ jsonrpc: '2.0', method: 'session/update', params: {
    sessionId: session.sessionId, update: toolCall,
  } }, 100);
  update({ sessionUpdate: 'tool_call', toolCallId: 'replace', title: 'Replace string', kind: 'edit', rawInput: { path: 'note.md', old_str: 'before', new_str: 'after' } });
  update({ sessionUpdate: 'tool_call_update', toolCallId: 'replace', rawInput: null, status: 'pending' });
  const params = { sessionId: session.sessionId, toolCall: { toolCallId: 'replace', title: 'Replace selected string' }, options: [
    { optionId: 'accept', name: 'Allow', kind: 'allow_once' },
    { optionId: 'reject', name: 'Deny', kind: 'reject_once' },
  ] };
  session.permission('replace-request', params);
  const card = [...session.permissions.values()][0];
  assert.equal(card.params.toolCall.kind, 'edit');
  assert.equal(card.params.toolCall.title, 'Replace selected string');
  assert.equal(card.params.toolCall.rawInput.new_str, 'after');
  assert.equal(card.request, params);
  assert.equal(params.toolCall.rawInput, undefined);
  assert.equal(writes.length, 0);
  assert.equal(session.state, 'waiting-for-approval');
  assert.equal(session.decide(card.id, 'accept'), true);
  assert.deepEqual(writes[0].result, { outcome: { outcome: 'selected', optionId: 'accept' } });
  // An ID-only request without prior details must also be shown, never auto-approved.
  session.permission('unknown-request', { ...params, toolCall: { toolCallId: 'unknown' } });
  assert.equal(session.permissions.size, 1);
  assert.equal(writes.length, 1);
});

test('agent "__proto__" keys stay visible and cannot supply hidden approval details', async t => {
  const session = create(t);
  await session.start('/fixture');
  session.setState('working');
  session.write = () => {};
  const frame = JSON.parse(`{"sessionId":"${session.sessionId}","toolCall":{"toolCallId":"p","__proto__":{"title":"Read README.md","rawInput":{"path":"README.md"}}},
    "options":[{"optionId":"y","name":"Yes","kind":"allow_once"}]}`);
  session.permission('proto', frame);
  const call = [...session.permissions.values()][0].params.toolCall;
  assert.equal(Object.getPrototypeOf(call), Object.prototype);
  assert.equal(call.rawInput, undefined);
  assert.match(JSON.stringify(call), /"__proto__":\{"title":"Read README.md"/);
});

test('unsupported permission cancels with no available card', async t => {
  const session = create(t);
  await session.start('/fixture');
  session.setState('working');
  const sent = [];
  const write = session.write.bind(session);
  session.write = frame => { sent.push(frame); write(frame); };
  const unsupported = once(session, 'unsupported-permission');
  session.permission('incomplete', {
    sessionId: session.sessionId,
    toolCall: { title: 'Friendly title', kind: 'execute' },
    options: [{ optionId: 'yes', name: 'Yes', kind: 'allow_once' }],
  });
  assert.deepEqual(await unsupported, ['INVALID_ACTION_DETAILS']);
  assert.deepEqual(sent[0].result, { outcome: { outcome: 'cancelled' } });
  assert.equal(session.permissions.size, 0);
});

test('keeps only valid select config options and flattens groups', () => {
  const options = sanitizeConfigOptions([
    { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'b', options: [
      { value: 'a', name: 'A', description: 'first' },
      { group: 'g', name: 'Group', options: [{ value: 'b', name: 'B' }, { value: 7, name: 'bad' }] },
    ] },
    { id: 'model', name: 'Duplicate', type: 'select', currentValue: 'a', options: [{ value: 'a', name: 'A' }] },
    { id: 'thinking', name: 'Thinking', type: 'boolean', currentValue: true },
    { id: 'stale', name: 'Stale', type: 'select', currentValue: 'gone', options: [{ value: 'a', name: 'A' }] },
    { id: '__proto__', name: 'Odd', type: 'select', currentValue: 'x', options: [{ value: 'x', name: 'X', extra: '<b>' }] },
  ]);
  assert.deepEqual(options, [
    { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'b', options: [
      { value: 'a', name: 'A', description: 'first' }, { value: 'b', name: 'B', group: 'Group' },
    ] },
    { id: '__proto__', name: 'Odd', type: 'select', currentValue: 'x', options: [{ value: 'x', name: 'X' }] },
  ]);
  assert.deepEqual(sanitizeConfigOptions('nope'), []);
  const many = Array.from({ length: 300 }, (_, i) => ({ value: `m${i}`, name: `M${i}` }));
  const capped = sanitizeConfigOptions([{ id: 'model', name: 'Model', type: 'select', currentValue: 'm0', options: many }]);
  assert.equal(capped[0].options.length, LIMITS.configValues);
});

test('reads, changes and follows agent updates to config options', async t => {
  const session = create(t, 'config');
  const writes = [];
  const write = session.write.bind(session);
  session.write = frame => { writes.push(frame); write(frame); };
  const started = await session.start('/fixture');
  const model = options => options.find(option => option.category === 'model');
  assert.equal(model(started.configOptions).currentValue, 'auto');
  await assert.rejects(session.setConfigOption('model', 'not-offered'), { code: 'CONFIG_VALUE_UNKNOWN' });
  const changed = await session.setConfigOption('model', 'sonnet');
  assert.deepEqual(writes.at(-1).params, { sessionId: 'fixture-session', configId: 'model', value: 'sonnet' });
  assert.equal(model(changed).currentValue, 'sonnet');
  const pushed = [];
  const updates = [];
  session.on('config-options', options => pushed.push(model(options).currentValue));
  session.on('update', update => updates.push(update.sessionUpdate));
  await session.prompt('hello');
  assert.deepEqual(pushed, ['opus']);
  assert.ok(!updates.includes('config_option_update'));
  assert.equal(session.state, 'ready');
});

test('a rejected config change keeps the session and the previous value', async t => {
  const session = create(t, 'config-reject');
  await session.start('/fixture');
  await assert.rejects(session.setConfigOption('model', 'opus'), { code: 'CONFIG_REJECTED' });
  assert.equal(session.state, 'ready');
  assert.equal(session.configOptions.find(option => option.id === 'model').currentValue, 'auto');
  assert.equal((await session.prompt('still works')).stopReason, 'end_turn');
});

test('config changes are refused before start and during a turn', async t => {
  const session = create(t, 'config');
  await assert.rejects(session.setConfigOption('model', 'opus'), { code: 'CONFIG_NOT_AVAILABLE' });
  await session.start('/fixture');
  const turn = session.prompt('hello');
  await assert.rejects(session.setConfigOption('model', 'opus'), { code: 'CONFIG_NOT_AVAILABLE' });
  await turn;
});

test('connect alone opens no chat; past chats list across pages for this directory only', async t => {
  const session = create(t, 'history');
  const methods = [];
  const write = session.write.bind(session);
  session.write = frame => { methods.push(frame.method); write(frame); };
  await session.connect();
  assert.equal(session.state, 'connected');
  assert.equal(session.sessionId, null);
  const entries = await session.listSessions('/fixture');
  assert.deepEqual(entries.map(entry => [entry.sessionId, entry.title]), [['recent', 'Recent chat'], ['old', 'Older chat'], ['untitled', '']]);
  assert.equal(entries[2].updatedAt, null);
  assert.deepEqual(methods, ['initialize', 'session/list', 'session/list']);
  assert.equal(session.state, 'connected');
});

test('loading a past chat replays its history before the session is ready', async t => {
  const session = create(t, 'history');
  const updates = [];
  session.on('update', update => updates.push([session.state, update.sessionUpdate]));
  await session.connect();
  await session.open('/fixture', 'old');
  assert.equal(session.sessionId, 'old');
  assert.equal(session.state, 'ready');
  assert.deepEqual(updates.map(([state]) => state), Array(6).fill('starting'));
  assert.equal(updates[0][1], 'user_message_chunk');
  assert.equal(session.configOptions.find(option => option.id === 'model').currentValue, 'opus');
  assert.equal((await session.prompt('next')).stopReason, 'end_turn');
});

test('agents without history refuse listing and loading before any request', async t => {
  const session = create(t);
  await session.connect();
  await assert.rejects(session.listSessions('/fixture'), { code: 'HISTORY_NOT_SUPPORTED' });
  await assert.rejects(session.open('/fixture', 'old'), { code: 'LOAD_NOT_SUPPORTED' });
  assert.equal(session.state, 'connected');
  await session.open('/fixture');
  assert.equal(session.state, 'ready');
});

test('a refused listing keeps the agent; a refused load ends it', async t => {
  const refused = create(t, 'history-refuse');
  await refused.connect();
  await assert.rejects(refused.listSessions('/fixture'), { code: 'HISTORY_UNAVAILABLE' });
  assert.equal(refused.state, 'connected');
  const missing = create(t, 'history');
  await missing.connect();
  await assert.rejects(missing.open('/fixture', 'missing'), { code: 'AGENT_REQUEST_FAILED' });
  assert.equal(missing.state, 'failed');
});
