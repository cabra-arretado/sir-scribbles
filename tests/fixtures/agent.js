import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';

const mode = process.argv[2] ?? 'normal';
const output = frame => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...frame }) + '\n');
const reply = (id, result) => output({ id, result });
const update = (value, sessionId = 'fixture-session') => output({ method: 'session/update', params: { sessionId, update: value } });
const permission = id => output({ id, method: 'session/request_permission', params: {
  sessionId: 'fixture-session',
  toolCall: {
    toolCallId: `tool-${id}`, title: 'Run a fixture action', kind: 'execute',
    rawInput: { command: 'printf', args: ['<script>bad()</script>', 'two words', '$(echo bad)'], cwd: '/fixture' },
    locations: [{ path: '/fixture/example.md' }],
  },
  options: [
    { optionId: 'yes', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'forever', name: 'Always allow', kind: 'allow_always' },
    { optionId: 'no', name: 'Deny once', kind: 'reject_once' },
  ],
  _meta: { kiro: { consent: { capability: 'shell', resource: 'printf', workspaceRoot: '/fixture', persistableConsent: true } } },
} });
const models = current => [
  { id: 'mode', name: 'Mode', category: 'mode', type: 'select', currentValue: 'default', options: [{ value: 'default', name: 'Default' }] },
  { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: current, options: [
    { value: 'auto', name: 'Auto', description: 'Picks for you' },
    { group: 'claude', name: 'Claude', options: [{ value: 'sonnet', name: 'Sonnet' }, { value: 'opus', name: 'Opus' }] },
  ] },
];
let promptId;
let pendingChoice = false;
let stalled = false;
let grandchild;
if (mode === 'ignore-term' || mode === 'grandchild') process.on('SIGTERM', () => {});
if (mode === 'grandchild') {
  grandchild = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' });
}
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  const frame = JSON.parse(line);
  if (frame.method === 'initialize') {
    if (mode === 'startup-hang') return;
    if (mode === 'invalid-json') { process.stdout.write('{bad}\n'); return; }
    reply(frame.id, {
      protocolVersion: mode === 'wrong-version' ? 2 : 1,
      agentCapabilities: mode.startsWith('history') ? { loadSession: true, sessionCapabilities: { list: {} } } : {},
      agentInfo: { name: 'fixture', version: 'test' },
    });
  } else if (frame.method === 'session/new') {
    reply(frame.id, mode.startsWith('config') ? { sessionId: 'fixture-session', configOptions: models('auto') } : { sessionId: 'fixture-session' });
    if (grandchild) update({ sessionUpdate: 'fixture-child', pid: grandchild.pid });
  } else if (frame.method === 'session/list') {
    if (mode === 'history-refuse') { output({ id: frame.id, error: { code: -32603, message: 'private detail' } }); return; }
    if (mode === 'history-stall') { setTimeout(() => reply(frame.id, { sessions: [] }), 150); return; }
    const { cwd } = frame.params;
    // Two pages; entries from another directory or without an ID are dropped.
    if (!frame.params.cursor) reply(frame.id, { nextCursor: 'page-2', sessions: [
      { sessionId: 'old', cwd, title: 'Older chat', updatedAt: '2026-01-02T10:00:00Z' },
      { sessionId: 'elsewhere', cwd: '/other', title: 'Other vault', updatedAt: '2026-03-01T10:00:00Z' },
      { cwd, title: 'No ID' },
    ] });
    else reply(frame.id, { sessions: [{ sessionId: 'recent', cwd, title: 'Recent chat', updatedAt: '2026-02-01T10:00:00Z' }, { sessionId: 'untitled', cwd }] });
  } else if (frame.method === 'session/load') {
    const { sessionId } = frame.params;
    if (sessionId === 'missing') { output({ id: frame.id, error: { code: -32002, message: 'private detail' } }); return; }
    update({ sessionUpdate: 'user_message_chunk', messageId: 'u1', content: { type: 'text', text: 'Earlier ' } }, sessionId);
    update({ sessionUpdate: 'user_message_chunk', messageId: 'u1', content: { type: 'text', text: 'question' } }, sessionId);
    update({ sessionUpdate: 'agent_message_chunk', messageId: 'a1', content: { type: 'text', text: 'First answer' } }, sessionId);
    update({ sessionUpdate: 'tool_call', toolCallId: 'replayed', title: 'Read note', status: 'completed' }, sessionId);
    update({ sessionUpdate: 'agent_message_chunk', messageId: 'a2', content: { type: 'text', text: 'Second answer' } }, sessionId);
    update({ sessionUpdate: 'session_info_update', title: 'Renamed by agent' }, sessionId);
    reply(frame.id, { configOptions: models('opus') });
  } else if (frame.method === 'session/set_config_option') {
    if (mode === 'config-reject') output({ id: frame.id, error: { code: -32602, message: 'private detail' } });
    else if (mode === 'config-stall') setTimeout(() => reply(frame.id, { configOptions: models(frame.params.value) }), 150);
    else if (mode === 'config-stall-first' && !stalled) { stalled = true; setTimeout(() => reply(frame.id, { configOptions: models(frame.params.value) }), 150); }
    else reply(frame.id, { configOptions: models(frame.params.value) });
  } else if (frame.method === 'session/prompt') {
    if (mode === 'history') {
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'continued' } }, frame.params.sessionId);
      reply(frame.id, { stopReason: 'end_turn' });
      return;
    }
    if (mode === 'config') update({ sessionUpdate: 'config_option_update', configOptions: models('opus') });
    promptId = frame.id;
    if (mode === 'transport-loss') { process.stdout.end(); return; }
    if (mode === 'permission' || mode === 'duplicate' || mode === 'queue' || mode === 'queue-overflow') {
      pendingChoice = true;
      permission(100);
      if (mode === 'duplicate') permission(100);
      if (mode === 'queue') permission(101);
      if (mode === 'queue-overflow') for (let id = 101; id <= 116; id++) permission(id);
      return;
    }
    if (mode === 'hang' || mode === 'cancel-hang') {
      update({ sessionUpdate: 'session_info_update', _meta: { kiro: { kind: 'turn_end' } } });
      return;
    }
    if (mode === 'client-methods') {
      output({ id: 'fs', method: 'fs/read_text_file', params: { path: '/not/read' } });
      output({ id: 'terminal', method: 'terminal/create', params: { command: 'never-run' } });
      return;
    }
    if (mode === 'huge-frame') { process.stdout.write('x'.repeat(4097)); return; }
    if (mode === 'stderr') process.stderr.write('private-secret'.repeat(10000));
    update({ sessionUpdate: 'unknown-optional', anything: true });
    update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '<script>alert(1)</script>\u001b[31m' } });
    update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ' second' } });
    reply(frame.id, { stopReason: 'end_turn' });
  } else if (frame.method === 'session/cancel') {
    if (mode !== 'cancel-hang') { pendingChoice = false; reply(promptId, { stopReason: 'cancelled' }); }
  } else if (Object.hasOwn(frame, 'result') && pendingChoice) {
    if (frame.result.outcome?.outcome === 'cancelled') return;
    if (mode === 'queue' && frame.id === 100) return;
    pendingChoice = false;
    update({ sessionUpdate: 'tool_call_update', toolCallId: `tool-${frame.id}`, rawOutput: frame.result, status: 'completed' });
    reply(promptId, { stopReason: 'end_turn' });
  } else if (frame.error && mode === 'client-methods' && frame.id === 'terminal') {
    reply(promptId, { stopReason: 'end_turn' });
  }
});
