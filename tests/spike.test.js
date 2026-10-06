import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/spike.js', import.meta.url));
const executable = fileURLToPath(new URL('./fixtures/sir-scribbles-fixture.js', import.meta.url));
const cwd = fileURLToPath(new URL('./fixtures', import.meta.url));

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('headless check exercises fixed launch, initialization and cleanup without certifying gate', {
  skip: process.platform !== 'darwin',
}, async () => {
  const result = await run(['--kiro', executable, '--cwd', cwd, '--check']);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  const events = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.find(event => event.type === 'initialized').value.identity.name, 'fixture');
  assert.equal(events.find(event => event.type === 'cleanup').value, 'observed');
  assert.match(events.find(event => event.type === 'gate').value, /NOT CERTIFIED/);
  assert.equal(events.some(event => event.type === 'agent-text'), false);
});

test('interactive run requires a terminal before launching agent', async () => {
  const result = await run(['--kiro', executable, '--cwd', cwd]);
  assert.equal(result.code, 1);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { type: 'failure', value: 'INTERACTIVE_TERMINAL_REQUIRED' });
});

test('harness rejects arbitrary launch flags and relative cwd', async () => {
  const arbitrary = await run(['--kiro', executable, '--cwd', cwd, '--trust-all-tools']);
  assert.equal(arbitrary.code, 1);
  assert.match(arbitrary.stdout, /INVALID_ARGUMENTS/);
  const relative = await run(['--kiro', executable, '--cwd', '.']);
  assert.equal(relative.code, 1);
  assert.match(relative.stdout, /KIRO_AND_ABSOLUTE_CWD_REQUIRED/);
});
