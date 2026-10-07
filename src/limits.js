export const LIMITS = Object.freeze({
  prompt: 128 * 1024,
  frame: 8 * 1024 * 1024,
  session: 16 * 1024 * 1024,
  stderr: 64 * 1024,
  permissions: 16,
  configOptions: 32,
  configValues: 256,
  chats: 5,
  historyEntries: 100,
  historyPages: 5,
  startupMs: 15_000,
  loadMs: 60_000,
  cancellationMs: 5_000,
  shutdownMs: 2_000,
});

export class OperationalError extends Error {
  constructor(code) {
    super(code);
    this.name = 'OperationalError';
    this.code = code;
  }
}

export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Define rather than assign: an agent-supplied "__proto__" key stays a visible
// own field instead of replacing the prototype and supplying hidden values.
export function mergeDefined(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value != null) Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return target;
}
