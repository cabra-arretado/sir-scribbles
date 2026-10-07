#!/usr/bin/env node
import { resolve, isAbsolute } from 'node:path';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { AcpSession } from '../src/acp.js';
import { launchAgent, validateExecutable } from '../src/process.js';
import { OperationalError } from '../src/limits.js';

// The spike deliberately displays content in the terminal, as JSON-escaped text.
// Do not redirect it to disk if testing with private prompts or action details.
const display = (type, value) => process.stdout.write(JSON.stringify({ type, value }) + '\n');

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--check') options.check = true;
    else if (flag === '--help') options.help = true;
    else if (['--agent', '--cwd'].includes(flag) && args[index + 1] && !args[index + 1].startsWith('--')) {
      options[flag.slice(2)] = args[++index];
    } else throw new OperationalError('INVALID_ARGUMENTS');
  }
  return options;
}

let session;
let input;
let forceAvailable = false;
let activeShown;
let closing = false;
const counts = { textChunks: 0, toolUpdates: 0, allowed: 0, denied: 0, unsupported: 0, completed: 0, cancelled: 0 };

function showActive() {
  const active = session.permissions.values().next().value;
  if (!active) { activeShown = undefined; return; }
  if (active === activeShown) {
    display('permission-queue', { queued: session.permissions.size - 1 });
    return;
  }
  activeShown = active;
  display('permission', {
    requestId: active.id,
    queued: session.permissions.size - 1,
    // Entire supplied action and context remain inspectable. JSON escaping keeps
    // terminal control sequences inert and shows argument-array boundaries.
    details: active.params,
    missing: ['locations', 'rawInput', 'kind', 'title'].filter(key => active.params.toolCall[key] == null),
    context: active.params._meta?.kiro?.consent ?? 'Working-directory/consent context not supplied',
    decisions: active.options,
    rule: active.rule ?? 'None: always choices are not offered for this request',
    instruction: 'Use /choose followed by the exact offered optionId. Always choices save the rule above in the agent. /stop cancels.',
  });
}

async function close() {
  if (closing) return;
  closing = true;
  input?.close();
  const result = await session?.close();
  if (result === false) process.exitCode = 1;
  display('exercise-counts', counts);
  display('gate', 'NOT CERTIFIED. Confirm real action execution, denial, cancellation and cleanup with the agent before release.');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: npm run spike -- --agent /absolute/path/to/agent --cwd /absolute/test/workspace [--check]\n');
  } else {
    if (!options.agent || !options.cwd || !isAbsolute(options.cwd)) throw new OperationalError('AGENT_AND_ABSOLUTE_CWD_REQUIRED');
    await validateExecutable(options.agent); // File metadata only; no --version execution.
    if (!(await stat(options.cwd)).isDirectory()) throw new OperationalError('DIRECTORY_REQUIRED');
    if (!options.check && !process.stdin.isTTY) throw new OperationalError('INTERACTIVE_TERMINAL_REQUIRED');
    display('boundary', 'The agent uses existing permissions, hooks, MCP servers, environment, network and history. The directory is not a sandbox.');
    session = new AcpSession(launchAgent(options.agent, resolve(options.cwd)));
    session.on('state', state => display('state', state));
    session.on('failure', code => { if (code !== 'SESSION_CLOSED') { display('failure', code); process.exitCode = 1; input?.close(); } });
    session.on('cleanup', outcome => { display('cleanup', outcome); if (outcome === 'uncertain') process.exitCode = 1; });
    session.on('permission', showActive);
    session.on('permission-settled', showActive);
    session.on('permissions-cancelled', () => { activeShown = undefined; });
    session.on('unsupported-permission', code => { counts.unsupported++; display('unsupported-permission', code); });
    session.on('force-stop-available', () => { forceAvailable = true; display('control', '/force is now available'); });
    session.on('update', update => {
      if (update.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
        counts.textChunks++;
        display('agent-text', update.content.text);
      } else if (['tool_call', 'tool_call_update'].includes(update.sessionUpdate)) {
        counts.toolUpdates++;
        display('tool', update);
      }
    });
    process.once('SIGINT', () => { void close(); });
    process.once('SIGTERM', () => { void close(); });
    const initialized = await session.start(resolve(options.cwd));
    display('initialized', initialized);
    if (options.check) {
      display('check', 'Initialization only; this does not pass the execution gate.');
      await close();
    } else {
      display('controls', 'Enter a single-line prompt. /choose OPTION_ID, /stop, /force (after delay), /quit. No prompts are retried.');
      input = createInterface({ input: process.stdin, terminal: false });
      input.on('close', () => { void close(); });
      input.on('line', line => {
        if (closing) return;
        if (line === '/quit') { void close(); return; }
        if (line === '/stop') { session.stop(); return; }
        if (line === '/force') {
          if (forceAvailable && session.state === 'stopping') void close();
          else display('control', 'Force stop is unavailable');
          return;
        }
        if (line.startsWith('/choose ')) {
          const active = session.permissions.values().next().value;
          const optionId = line.slice(8);
          const option = active?.options.find(candidate => candidate.optionId === optionId);
          if (active && option && session.decide(active.id, optionId)) {
            counts[option.kind === 'allow_once' ? 'allowed' : 'denied']++;
          } else display('control', 'No matching active choice');
          return;
        }
        if (session.state !== 'ready') { display('control', 'Wait for Ready; prompt was not sent'); return; }
        forceAvailable = false;
        void session.prompt(line).then(response => {
          counts[response.stopReason === 'cancelled' ? 'cancelled' : 'completed']++;
          display('turn', { stopReason: response.stopReason });
        }).catch(error => {
          display('prompt-failure', error instanceof OperationalError ? error.code : 'PROMPT_FAILED');
          if (session.transportClosed) { process.exitCode = 1; void close(); }
        });
      });
    }
  }
} catch (error) {
  display('failure', error instanceof OperationalError ? error.code : 'SPIKE_FAILED');
  process.exitCode = 1;
  if (session) await close();
}
