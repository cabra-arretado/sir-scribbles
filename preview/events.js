// Minimal browser stand-in for node:events, for the UI preview only.
export class EventEmitter {
  constructor() { this.listeners = new Map(); }
  on(event, fn) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(fn); return this; }
  off(event, fn) { this.listeners.get(event)?.delete(fn); return this; }
  emit(event, ...args) { for (const fn of [...(this.listeners.get(event) ?? [])]) fn(...args); return true; }
  removeAllListeners() { this.listeners.clear(); return this; }
}
