import { EventEmitter } from 'node:events';
import { TextDecoder } from 'node:util';
import { LIMITS, OperationalError, isRecord, mergeDefined } from './limits.js';
import { inspectPermission, cancelledPermission, selectedPermission, isPersistent } from './permissions.js';
import { terminateOwnedProcess } from './process.js';

const validId = id => (typeof id === 'string' && id.length > 0) || Number.isSafeInteger(id);
const idKey = id => `${typeof id}:${id}`;
const label = (value, max = 1024) => typeof value === 'string' && value.length > 0 && value.length <= max;

function configValue(entry, group) {
  if (!isRecord(entry) || !label(entry.value) || !label(entry.name)) return null;
  const value = { value: entry.value, name: entry.name };
  if (label(entry.description)) value.description = entry.description;
  if (group) value.group = group;
  return value;
}

// Keep only select options with a valid current value. Grouped values are
// flattened with their group name; anything else the agent sends is dropped.
export function sanitizeConfigOptions(input, limits = LIMITS) {
  if (!Array.isArray(input)) return [];
  const options = [];
  for (const entry of input.slice(0, limits.configOptions)) {
    if (!isRecord(entry) || entry.type !== 'select' || !label(entry.id) || !label(entry.name) ||
        !Array.isArray(entry.options) || options.some(option => option.id === entry.id)) continue;
    const values = [];
    for (const item of entry.options) {
      if (isRecord(item) && Array.isArray(item.options)) {
        for (const nested of item.options.slice(0, limits.configValues - values.length)) {
          values.push(configValue(nested, label(item.name) ? item.name : ''));
        }
      } else values.push(configValue(item, ''));
      if (values.length >= limits.configValues) break;
    }
    const valid = values.filter(Boolean).slice(0, limits.configValues);
    if (!valid.some(value => value.value === entry.currentValue)) continue;
    const option = { id: entry.id, name: entry.name, type: 'select', currentValue: entry.currentValue, options: valid };
    if (label(entry.description)) option.description = entry.description;
    if (label(entry.category, 128)) option.category = entry.category;
    options.push(option);
  }
  return options;
}

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
    this.cwd = null;
    this.configOptions = [];
    this.startupUpdates = [];
    this.pending = new Map();
    this.permissions = new Map();
    this.toolCalls = new Map();
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
        else if (frame.params.sessionId === this.sessionId) this.deliver(frame.params.update);
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

  deliver(update) {
    if (update.sessionUpdate === 'config_option_update') {
      this.setConfigOptions(update.configOptions);
      return;
    }
    this.rememberToolCall(update);
    this.emit('update', update);
  }

  setConfigOptions(input) {
    this.configOptions = sanitizeConfigOptions(input, this.limits);
    this.emit('config-options', this.configOptions);
  }

  rememberToolCall(update) {
    if (!['tool_call', 'tool_call_update'].includes(update?.sessionUpdate) || typeof update.toolCallId !== 'string') return;
    const call = this.mergeToolCall(update, update.sessionUpdate === 'tool_call' ? {} : this.toolCalls.get(update.toolCallId));
    this.retain(Buffer.byteLength(JSON.stringify(call)));
    this.toolCalls.set(update.toolCallId, call);
  }

  mergeToolCall(update, previous = {}) {
    return mergeDefined(mergeDefined({}, previous), update);
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
    const resolved = isRecord(params?.toolCall)
      ? { ...params, toolCall: this.mergeToolCall(params.toolCall, this.toolCalls.get(params.toolCall.toolCallId)) }
      : params;
    const inspected = inspectPermission(resolved, this.cwd);
    if (!inspected.supported) {
      this.reply(id, cancelledPermission());
      this.emit('unsupported-permission', inspected.reason);
      return;
    }
    const card = { id, params: resolved, request: params, options: inspected.options, unrecognized: inspected.unrecognized, rule: inspected.rule };
    this.permissions.set(key, card);
    this.setState('waiting-for-approval');
    this.emit('permission', card);
  }

  decide(id, optionId) {
    const key = idKey(id);
    const card = this.permissions.get(key);
    const active = this.permissions.values().next().value;
    const option = card?.options.find(entry => entry.optionId === optionId);
    if (this.state !== 'waiting-for-approval' || !card || active !== card || !option) return false;
    this.permissions.delete(key); // Decision is single-use even under synchronous listeners.
    this.reply(id, selectedPermission(optionId, isPersistent(option) ? card.rule : null));
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

  // Initialize only. A chat is then opened, new or past, with open(), so past
  // chats can be listed without creating an empty session first.
  async connect() {
    if (this.state !== 'not-started') throw new OperationalError('START_NOT_AVAILABLE');
    this.setState('starting');
    this.startupTimer = setTimeout(() => this.fail('STARTUP_TIMEOUT'), this.limits.startupMs);
    try {
      const initialized = await this.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'sir-scribbles', version: '0.0.1' },
      });
      if (!isRecord(initialized) || initialized.protocolVersion !== 1 || !isRecord(initialized.agentCapabilities)) {
        throw new OperationalError('INCOMPATIBLE_PROTOCOL');
      }
      if (this.transportClosed) throw new OperationalError('TRANSPORT_CLOSED');
      this.identity = initialized.agentInfo ?? null;
      this.capabilities = initialized.agentCapabilities;
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
      this.setState('connected');
      return { identity: this.identity, capabilities: this.capabilities };
    } catch (error) {
      this.fail(error.code || 'START_FAILED');
      if (this.cleanup) await this.cleanup;
      throw error;
    }
  }

  canList() { return isRecord(this.capabilities?.sessionCapabilities) && isRecord(this.capabilities.sessionCapabilities.list); }
  canLoad() { return this.capabilities?.loadSession === true; }

  // Past chats for this directory, newest first. A refused listing leaves the
  // agent usable; entries from other directories or without an ID are dropped.
  async listSessions(cwd) {
    if (!['connected', 'ready'].includes(this.state)) throw new OperationalError('HISTORY_NOT_AVAILABLE');
    if (!this.canList()) throw new OperationalError('HISTORY_NOT_SUPPORTED');
    const entries = [];
    let cursor;
    for (let page = 0; page < this.limits.historyPages && entries.length < this.limits.historyEntries; page++) {
      let result;
      try { result = await this.request('session/list', cursor ? { cwd, cursor } : { cwd }); }
      catch (error) { throw new OperationalError(this.transportClosed ? error.code : 'HISTORY_UNAVAILABLE'); }
      if (!isRecord(result) || !Array.isArray(result.sessions)) throw new OperationalError('HISTORY_UNAVAILABLE');
      for (const item of result.sessions) {
        if (entries.length >= this.limits.historyEntries) break;
        if (!isRecord(item) || !label(item.sessionId) || item.cwd !== cwd || entries.some(entry => entry.sessionId === item.sessionId)) continue;
        const updated = typeof item.updatedAt === 'string' ? Date.parse(item.updatedAt) : NaN;
        entries.push({ sessionId: item.sessionId, title: label(item.title, 512) ? item.title : '', updatedAt: Number.isFinite(updated) ? updated : null });
      }
      if (!label(result.nextCursor)) break;
      cursor = result.nextCursor;
    }
    return entries.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }

  // Opens a new chat, or loads a past one. Loading replays its history as
  // ordinary session updates before the response arrives.
  async open(cwd, sessionId = null) {
    if (this.state !== 'connected') throw new OperationalError('START_NOT_AVAILABLE');
    if (sessionId !== null && (!this.canLoad() || !label(sessionId))) throw new OperationalError('LOAD_NOT_SUPPORTED');
    this.cwd = cwd;
    this.setState('starting');
    this.startupTimer = setTimeout(() => this.fail('STARTUP_TIMEOUT'), sessionId ? this.limits.loadMs : this.limits.startupMs);
    try {
      let session;
      if (sessionId) {
        // Known up front, so replayed updates are delivered as they arrive.
        this.sessionId = sessionId;
        session = await this.request('session/load', { sessionId, cwd, mcpServers: [] });
        if (!isRecord(session)) throw new OperationalError('INVALID_SESSION');
      } else {
        session = await this.request('session/new', { cwd, mcpServers: [] });
        if (!isRecord(session) || typeof session.sessionId !== 'string' || !session.sessionId) {
          throw new OperationalError('INVALID_SESSION');
        }
      }
      if (this.transportClosed) throw new OperationalError('TRANSPORT_CLOSED');
      this.sessionId = sessionId ?? session.sessionId;
      this.configOptions = sanitizeConfigOptions(session.configOptions, this.limits);
      const startupUpdates = this.startupUpdates;
      this.startupUpdates = [];
      for (const params of startupUpdates) {
        if (params.sessionId === this.sessionId) this.deliver(params.update);
      }
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
      this.setState('ready');
      return { identity: this.identity, capabilities: this.capabilities, configOptions: this.configOptions };
    } catch (error) {
      this.fail(error.code || 'START_FAILED');
      if (this.cleanup) await this.cleanup;
      throw error;
    }
  }

  async start(cwd, sessionId = null) {
    await this.connect();
    return this.open(cwd, sessionId);
  }

  async prompt(text) {
    if (this.state !== 'ready') throw new OperationalError('PROMPT_NOT_AVAILABLE');
    if (typeof text !== 'string' || !text.trim()) throw new OperationalError('EMPTY_PROMPT');
    if (Buffer.byteLength(text) > this.limits.prompt) throw new OperationalError('PROMPT_LIMIT');
    try { this.retain(Buffer.byteLength(text)); }
    catch (error) { this.fail(error.code); throw error; }
    this.toolCalls.clear();
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
      this.toolCalls.clear();
      if (!this.transportClosed) this.setState('ready');
    }
  }

  // Only between turns, and only to a value the agent offered. A rejected
  // change leaves the session usable; the agent keeps its previous value.
  async setConfigOption(configId, value) {
    if (this.state !== 'ready') throw new OperationalError('CONFIG_NOT_AVAILABLE');
    const option = this.configOptions.find(entry => entry.id === configId);
    if (!option?.options.some(entry => entry.value === value)) throw new OperationalError('CONFIG_VALUE_UNKNOWN');
    let result;
    try { result = await this.request('session/set_config_option', { sessionId: this.sessionId, configId, value }); }
    catch (error) { throw new OperationalError(this.transportClosed ? error.code : 'CONFIG_REJECTED'); }
    if (this.transportClosed) throw new OperationalError('TRANSPORT_CLOSED');
    if (!isRecord(result) || !Array.isArray(result.configOptions)) throw new OperationalError('CONFIG_REJECTED');
    this.setConfigOptions(result.configOptions);
    return this.configOptions;
  }

  stop() {
    if (['starting', 'connected'].includes(this.state)) { this.close(); return; }
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
    this.toolCalls.clear();
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
