import { EventEmitter } from 'node:events';
import { TextDecoder } from 'node:util';
import { LIMITS, OperationalError, isRecord } from './limits.js';
import { inspectPermission, cancelledPermission, selectedPermission } from './permissions.js';
import { terminateOwnedProcess } from './process.js';

const validId = id => (typeof id === 'string' && id.length > 0) || Number.isSafeInteger(id);
const idKey = id => `${typeof id}:${id}`;

// Allocate one bounded buffer, not an unbounded string or chunk list.
// Scan byte boundaries before parsing and reject malformed UTF-8.
export class FrameReader {
  constructor(onFrame, limit = LIMITS.frame) {
    this.onFrame = onFrame;
    this.buffer = Buffer.alloc(limit);
    this.length = 0;
    this.limit = limit;
    this.decoder = new TextDecoder('utf-8', { fatal: true });
  }
  push(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline;
      const size = end - offset;
      if (this.length + size > this.limit) throw new OperationalError('FRAME_LIMIT');
      chunk.copy(this.buffer, this.length, offset, end);
      this.length += size;
      if (newline < 0) return;
      const frame = this.buffer.subarray(0, this.length);
      this.length = 0;
      if (frame.length) {
        // JSON.parse accepts very deep objects that later overflow renderers or
        // JSON.stringify. Reject excessive nesting before building that tree.
        let depth = 0;
        let quoted = false;
        let escaped = false;
        for (const byte of frame) {
          if (quoted) {
            if (escaped) escaped = false;
            else if (byte === 92) escaped = true;
            else if (byte === 34) quoted = false;
          } else if (byte === 34) quoted = true;
          else if (byte === 123 || byte === 91) {
            if (++depth > 64) throw new OperationalError('JSON_DEPTH_LIMIT');
          } else if (byte === 125 || byte === 93) depth--;
        }
        let parsed;
        try { parsed = JSON.parse(this.decoder.decode(frame)); }
        catch { throw new OperationalError('INVALID_FRAME'); }
        this.onFrame(parsed, frame.length);
      }
      offset = newline + 1;
    }
  }
  finish() {
    if (this.length) throw new OperationalError('UNTERMINATED_FRAME');
  }
}

export class AcpSession extends EventEmitter {
  constructor(child, { limits = LIMITS, terminate = terminateOwnedProcess } = {}) {
    super();
    this.child = child;
    this.limits = limits;
    this.terminate = terminate;
    this.state = 'not-started';
    this.sessionId = null;
    this.startupUpdates = [];
    this.pending = new Map();
    this.permissions = new Map();
    this.seenPermissionIds = new Set();
    this.nextId = 1;
    this.retainedBytes = 0;
    this.extraRetainedBytes = () => 0;
    this.stderr = Buffer.alloc(0);
    this.transportClosed = false;
    this.stopTimer = null;
    this.startupTimer = null;
    this.cleanup = null;
    this.reader = new FrameReader((frame, size) => this.receive(frame, size), limits.frame);
    child.stdout.on('data', chunk => {
      if (this.transportClosed) return;
      try { this.reader.push(chunk); }
      catch (error) { this.fail(error instanceof OperationalError ? error.code : 'INVALID_FRAME'); }
    });
    child.stderr.on('data', chunk => {
      if (this.transportClosed) return;
      const tail = chunk.subarray(Math.max(0, chunk.length - limits.stderr));
      this.stderr = Buffer.concat([this.stderr, tail]).subarray(-limits.stderr);
    });
    child.stdout.on('end', () => {
      if (this.transportClosed) return;
      try { this.reader.finish(); }
      catch (error) { this.fail(error.code); return; }
      this.fail('TRANSPORT_LOST');
    });
    child.on('error', () => this.fail('PROCESS_FAILED'));
    child.on('exit', () => { if (!this.transportClosed) this.fail('PROCESS_EXITED'); });
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      stream.on('error', () => { if (!this.transportClosed) this.fail('TRANSPORT_LOST'); });
    }
  }

  setState(state) { this.state = state; this.emit('state', state); }

  retain(bytes) {
    if (this.retainedBytes + bytes + this.extraRetainedBytes() > this.limits.session) throw new OperationalError('SESSION_LIMIT');
    this.retainedBytes += bytes;
  }

  write(frame) {
    if (this.transportClosed || this.child.stdin.destroyed) throw new OperationalError('TRANSPORT_CLOSED');
    const encoded = JSON.stringify(frame) + '\n';
    if (Buffer.byteLength(encoded) > this.limits.frame ||
        this.child.stdin.writableLength + Buffer.byteLength(encoded) > this.limits.frame) {
      throw new OperationalError('OUTGOING_LIMIT');
    }
    this.child.stdin.write(encoded);
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.write({ jsonrpc: '2.0', id, method, params }); }
      catch (error) { this.pending.delete(id); reject(error); this.fail(error.code || 'WRITE_FAILED'); }
    });
  }

  notify(method, params) { this.write({ jsonrpc: '2.0', method, params }); }
  reply(id, result) { this.write({ jsonrpc: '2.0', id, result }); }

  receive(frame, bytes) {
    if (this.transportClosed) return;
    if (!isRecord(frame) || frame.jsonrpc !== '2.0') throw new OperationalError('INVALID_RPC');
    // Conservative cumulative budget also bounds ignored updates and duplicate IDs.
    this.retain(bytes);
    if (typeof frame.method === 'string') {
      if (Object.hasOwn(frame, 'id')) {
        if (!validId(frame.id)) throw new OperationalError('INVALID_REQUEST_ID');
        if (frame.method === 'session/request_permission') this.permission(frame.id, frame.params);
        else this.write({ jsonrpc: '2.0', id: frame.id, error: { code: -32601, message: 'Client method unsupported' } });
        return;
      }
      if (frame.method === 'session/update') {
        if (!isRecord(frame.params) || !isRecord(frame.params.update)) throw new OperationalError('INVALID_UPDATE');
        if (this.state === 'starting' && this.sessionId === null) this.startupUpdates.push(frame.params);
        else if (frame.params.sessionId === this.sessionId) this.emit('update', frame.params.update);
      }
      return;
    }
    if (!validId(frame.id) || (Object.hasOwn(frame, 'result') === Object.hasOwn(frame, 'error'))) {
      throw new OperationalError('INVALID_RESPONSE');
    }
    const pending = this.pending.get(frame.id);
    if (!pending) throw new OperationalError('UNMATCHED_RESPONSE');
    this.pending.delete(frame.id);
    // Do not copy the server's potentially sensitive message into diagnostics.
    if (Object.hasOwn(frame, 'error')) pending.reject(new OperationalError('AGENT_REQUEST_FAILED'));
    else pending.resolve(frame.result);
  }

  permission(id, params) {
    const key = idKey(id);
    if (this.seenPermissionIds.has(key)) throw new OperationalError('DUPLICATE_PERMISSION');
    this.seenPermissionIds.add(key);
    if (params?.sessionId !== this.sessionId || !['working', 'waiting-for-approval'].includes(this.state)) {
      this.reply(id, cancelledPermission());
      return;
    }
    if (this.permissions.size >= this.limits.permissions) {
      this.reply(id, cancelledPermission());
      throw new OperationalError('PERMISSION_LIMIT');
    }
    const inspected = inspectPermission(params);
    if (!inspected.supported) {
      this.reply(id, cancelledPermission());
      this.emit('unsupported-permission', inspected.reason);
      return;
    }
    const card = { id, params, options: inspected.options };
    this.permissions.set(key, card);
    this.setState('waiting-for-approval');
    this.emit('permission', card);
  }

  decide(id, optionId) {
    const key = idKey(id);
    const card = this.permissions.get(key);
    const active = this.permissions.values().next().value;
    if (this.state !== 'waiting-for-approval' || !card || active !== card ||
        !card.options.some(option => option.optionId === optionId)) return false;
    this.permissions.delete(key); // Decision is single-use even under synchronous listeners.
    this.reply(id, selectedPermission(optionId));
    this.setState(this.permissions.size ? 'waiting-for-approval' : 'working');
    this.emit('permission-settled', id);
    return true;
  }

  cancelPermissions() {
    const cards = [...this.permissions.values()];
    this.permissions.clear();
    for (const card of cards) {
      try { this.reply(card.id, cancelledPermission()); } catch { /* Broken pipe: outcome is uncertain. */ }
    }
    this.emit('permissions-cancelled');
  }

  async start(cwd) {
    if (this.state !== 'not-started') throw new OperationalError('START_NOT_AVAILABLE');
    this.setState('starting');
    this.startupTimer = setTimeout(() => this.fail('STARTUP_TIMEOUT'), this.limits.startupMs);
    try {
      const initialized = await this.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'obsidian-noter', version: '0.0.1' },
      });
      if (!isRecord(initialized) || initialized.protocolVersion !== 1 || !isRecord(initialized.agentCapabilities)) {
        throw new OperationalError('INCOMPATIBLE_PROTOCOL');
      }
      this.identity = initialized.agentInfo ?? null;
      this.capabilities = initialized.agentCapabilities;
      const session = await this.request('session/new', { cwd, mcpServers: [] });
      if (!isRecord(session) || typeof session.sessionId !== 'string' || !session.sessionId) {
        throw new OperationalError('INVALID_SESSION');
      }
      if (this.transportClosed) throw new OperationalError('TRANSPORT_CLOSED');
      this.sessionId = session.sessionId;
      const startupUpdates = this.startupUpdates;
      this.startupUpdates = [];
      for (const params of startupUpdates) {
        if (params.sessionId === this.sessionId) this.emit('update', params.update);
      }
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
      this.setState('ready');
      return { identity: this.identity, capabilities: this.capabilities };
    } catch (error) {
      this.fail(error.code || 'START_FAILED');
      if (this.cleanup) await this.cleanup;
      throw error;
    }
  }

  async prompt(text) {
    if (this.state !== 'ready') throw new OperationalError('PROMPT_NOT_AVAILABLE');
    if (typeof text !== 'string' || !text.trim()) throw new OperationalError('EMPTY_PROMPT');
    if (Buffer.byteLength(text) > this.limits.prompt) throw new OperationalError('PROMPT_LIMIT');
    try { this.retain(Buffer.byteLength(text)); }
    catch (error) { this.fail(error.code); throw error; }
    this.setState('working');
    try {
      const response = await this.request('session/prompt', { sessionId: this.sessionId, prompt: [{ type: 'text', text }] });
      if (!isRecord(response) || typeof response.stopReason !== 'string') throw new OperationalError('INVALID_PROMPT_RESPONSE');
      return response;
    } catch (error) {
      if (!this.transportClosed) this.fail(error.code || 'PROMPT_FAILED');
      throw error;
    } finally {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
      this.cancelPermissions();
      if (!this.transportClosed) this.setState('ready');
    }
  }

  stop() {
    if (this.state === 'starting') { this.close(); return; }
    if (!['working', 'waiting-for-approval'].includes(this.state)) return;
    this.setState('stopping');
    this.cancelPermissions();
    try { this.notify('session/cancel', { sessionId: this.sessionId }); }
    catch { this.fail('CANCEL_FAILED'); return; }
    this.stopTimer = setTimeout(() => {
      if (this.state === 'stopping') this.emit('force-stop-available');
    }, this.limits.cancellationMs);
  }

  fail(code) {
    if (this.transportClosed) return;
    this.shutdown('failed', code);
  }

  shutdown(state, code) {
    this.cancelPermissions();
    this.transportClosed = true;
    clearTimeout(this.startupTimer);
    clearTimeout(this.stopTimer);
    this.startupTimer = this.stopTimer = null;
    for (const pending of this.pending.values()) pending.reject(new OperationalError(code));
    this.pending.clear();
    this.startupUpdates = [];
    this.setState(state);
    this.emit('failure', code);
    this.cleanup = this.terminate(this.child, this.limits.shutdownMs).then(() => {
      this.emit('cleanup', 'observed');
      this.stderr = Buffer.alloc(0);
    }).catch(() => {
      this.emit('cleanup', 'uncertain');
      return false;
    });
  }

  async close() {
    if (!this.transportClosed) this.shutdown('terminated', 'SESSION_CLOSED');
    return this.cleanup;
  }
}
