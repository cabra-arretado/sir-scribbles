import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { LIMITS, OperationalError } from './limits.js';

export const KIRO_ARGS = Object.freeze(['acp', '--agent-engine=v3', '--auth-method=cli']);

export async function validateExecutable(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new OperationalError('ABSOLUTE_EXECUTABLE_REQUIRED');
  try {
    if (!(await stat(path)).isFile()) throw new Error();
    await access(path, constants.X_OK);
  } catch {
    throw new OperationalError('EXECUTABLE_NOT_AVAILABLE');
  }
}

export function launchKiro(executable, cwd) {
  if (process.platform !== 'darwin') throw new OperationalError('MACOS_REQUIRED');
  return spawn(executable, [...KIRO_ARGS], {
    cwd,
    shell: false,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    // Inherit the normal OS environment. No plugin credentials or overrides.
  });
}

function groupExists(pid) {
  try { process.kill(-pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

function signalGroup(pid, signal) {
  try { process.kill(-pid, signal); }
  catch (error) { if (error.code !== 'ESRCH') throw new OperationalError('GROUP_SIGNAL_FAILED'); }
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Do not confuse the direct child's exit with the owned group's exit.
// Detached descendants that leave the group cannot be accounted for here.
export async function terminateOwnedProcess(child, graceMs = LIMITS.shutdownMs) {
  if (!child.pid) {
    child.stdin?.destroy();
    child.stdout?.destroy();
    child.stderr?.destroy();
    return;
  }
  const pid = child.pid;
  signalGroup(pid, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (groupExists(pid) && Date.now() < deadline) await pause(20);
  if (groupExists(pid)) signalGroup(pid, 'SIGKILL');
  const killDeadline = Date.now() + graceMs;
  while (groupExists(pid) && Date.now() < killDeadline) await pause(20);
  child.stdin?.destroy();
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (groupExists(pid) || (child.exitCode === null && child.signalCode === null)) {
    throw new OperationalError('CLEANUP_UNCERTAIN');
  }
}
