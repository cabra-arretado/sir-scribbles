import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AcpSession, FrameReader } from '../src/acp.js';
import { LIMITS } from '../src/limits.js';
import { validateExecutable, KIRO_ARGS } from '../src/process.js';

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
  assert.deepEqual(KIRO_ARGS, ['acp', '--agent-engine=v3', '--auth-method=cli']);
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
    toolCall: { toolCallId: 'no-input', title: 'Friendly title', kind: 'execute' },
    options: [{ optionId: 'yes', name: 'Yes', kind: 'allow_once' }],
  });
  assert.deepEqual(await unsupported, ['MISSING_ACTION_DETAILS']);
  assert.deepEqual(sent[0].result, { outcome: { outcome: 'cancelled' } });
  assert.equal(session.permissions.size, 0);
});
