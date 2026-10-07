var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/punycode.js/punycode.js
var require_punycode = __commonJS({
  "node_modules/punycode.js/punycode.js"(exports2, module2) {
    "use strict";
    var maxInt = 2147483647;
    var base = 36;
    var tMin = 1;
    var tMax = 26;
    var skew = 38;
    var damp = 700;
    var initialBias = 72;
    var initialN = 128;
    var delimiter = "-";
    var regexPunycode = /^xn--/;
    var regexNonASCII = /[^\0-\x7F]/;
    var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g;
    var errors = {
      "overflow": "Overflow: input needs wider integers to process",
      "not-basic": "Illegal input >= 0x80 (not a basic code point)",
      "invalid-input": "Invalid input"
    };
    var baseMinusTMin = base - tMin;
    var floor = Math.floor;
    var stringFromCharCode = String.fromCharCode;
    function error(type) {
      throw new RangeError(errors[type]);
    }
    function map(array, callback) {
      const result = [];
      let length = array.length;
      while (length--) {
        result[length] = callback(array[length]);
      }
      return result;
    }
    function mapDomain(domain, callback) {
      const parts = domain.split("@");
      let result = "";
      if (parts.length > 1) {
        result = parts[0] + "@";
        domain = parts[1];
      }
      domain = domain.replace(regexSeparators, ".");
      const labels = domain.split(".");
      const encoded = map(labels, callback).join(".");
      return result + encoded;
    }
    function ucs2decode(string) {
      const output = [];
      let counter = 0;
      const length = string.length;
      while (counter < length) {
        const value = string.charCodeAt(counter++);
        if (value >= 55296 && value <= 56319 && counter < length) {
          const extra = string.charCodeAt(counter++);
          if ((extra & 64512) == 56320) {
            output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
          } else {
            output.push(value);
            counter--;
          }
        } else {
          output.push(value);
        }
      }
      return output;
    }
    var ucs2encode = (codePoints) => String.fromCodePoint(...codePoints);
    var basicToDigit = function(codePoint) {
      if (codePoint >= 48 && codePoint < 58) {
        return 26 + (codePoint - 48);
      }
      if (codePoint >= 65 && codePoint < 91) {
        return codePoint - 65;
      }
      if (codePoint >= 97 && codePoint < 123) {
        return codePoint - 97;
      }
      return base;
    };
    var digitToBasic = function(digit, flag) {
      return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
    };
    var adapt = function(delta, numPoints, firstTime) {
      let k = 0;
      delta = firstTime ? floor(delta / damp) : delta >> 1;
      delta += floor(delta / numPoints);
      for (; delta > baseMinusTMin * tMax >> 1; k += base) {
        delta = floor(delta / baseMinusTMin);
      }
      return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
    };
    var decode2 = function(input) {
      const output = [];
      const inputLength = input.length;
      let i = 0;
      let n = initialN;
      let bias = initialBias;
      let basic = input.lastIndexOf(delimiter);
      if (basic < 0) {
        basic = 0;
      }
      for (let j = 0; j < basic; ++j) {
        if (input.charCodeAt(j) >= 128) {
          error("not-basic");
        }
        output.push(input.charCodeAt(j));
      }
      for (let index = basic > 0 ? basic + 1 : 0; index < inputLength; ) {
        const oldi = i;
        for (let w = 1, k = base; ; k += base) {
          if (index >= inputLength) {
            error("invalid-input");
          }
          const digit = basicToDigit(input.charCodeAt(index++));
          if (digit >= base) {
            error("invalid-input");
          }
          if (digit > floor((maxInt - i) / w)) {
            error("overflow");
          }
          i += digit * w;
          const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
          if (digit < t) {
            break;
          }
          const baseMinusT = base - t;
          if (w > floor(maxInt / baseMinusT)) {
            error("overflow");
          }
          w *= baseMinusT;
        }
        const out = output.length + 1;
        bias = adapt(i - oldi, out, oldi == 0);
        if (floor(i / out) > maxInt - n) {
          error("overflow");
        }
        n += floor(i / out);
        i %= out;
        output.splice(i++, 0, n);
      }
      return String.fromCodePoint(...output);
    };
    var encode2 = function(input) {
      const output = [];
      input = ucs2decode(input);
      const inputLength = input.length;
      let n = initialN;
      let delta = 0;
      let bias = initialBias;
      for (const currentValue of input) {
        if (currentValue < 128) {
          output.push(stringFromCharCode(currentValue));
        }
      }
      const basicLength = output.length;
      let handledCPCount = basicLength;
      if (basicLength) {
        output.push(delimiter);
      }
      while (handledCPCount < inputLength) {
        let m = maxInt;
        for (const currentValue of input) {
          if (currentValue >= n && currentValue < m) {
            m = currentValue;
          }
        }
        const handledCPCountPlusOne = handledCPCount + 1;
        if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
          error("overflow");
        }
        delta += (m - n) * handledCPCountPlusOne;
        n = m;
        for (const currentValue of input) {
          if (currentValue < n && ++delta > maxInt) {
            error("overflow");
          }
          if (currentValue === n) {
            let q = delta;
            for (let k = base; ; k += base) {
              const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
              if (q < t) {
                break;
              }
              const qMinusT = q - t;
              const baseMinusT = base - t;
              output.push(
                stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
              );
              q = floor(qMinusT / baseMinusT);
            }
            output.push(stringFromCharCode(digitToBasic(q, 0)));
            bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
            delta = 0;
            ++handledCPCount;
          }
        }
        ++delta;
        ++n;
      }
      return output.join("");
    };
    var toUnicode = function(input) {
      return mapDomain(input, function(string) {
        return regexPunycode.test(string) ? decode2(string.slice(4).toLowerCase()) : string;
      });
    };
    var toASCII = function(input) {
      return mapDomain(input, function(string) {
        return regexNonASCII.test(string) ? "xn--" + encode2(string) : string;
      });
    };
    var punycode2 = {
      /**
       * A string representing the current Punycode.js version number.
       * @memberOf punycode
       * @type String
       */
      "version": "2.3.1",
      /**
       * An object of methods to convert from JavaScript's internal character
       * representation (UCS-2) to Unicode code points, and back.
       * @see <https://mathiasbynens.be/notes/javascript-encoding>
       * @memberOf punycode
       * @type Object
       */
      "ucs2": {
        "decode": ucs2decode,
        "encode": ucs2encode
      },
      "decode": decode2,
      "encode": encode2,
      "toASCII": toASCII,
      "toUnicode": toUnicode
    };
    module2.exports = punycode2;
  }
});

// src/main.js
var main_exports = {};
__export(main_exports, {
  default: () => SirScribblesPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/chat.js
var import_node_events2 = require("node:events");

// src/acp.js
var import_node_events = require("node:events");
var import_node_util = require("node:util");

// src/limits.js
var LIMITS = Object.freeze({
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
  startupMs: 15e3,
  loadMs: 6e4,
  requestMs: 15e3,
  cancellationMs: 5e3,
  shutdownMs: 2e3
});
var OperationalError = class extends Error {
  constructor(code2) {
    super(code2);
    this.name = "OperationalError";
    this.code = code2;
  }
};
var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function mergeDefined(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value != null) Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return target;
}

// src/permissions.js
var knownKinds = /* @__PURE__ */ new Set(["allow_once", "reject_once", "allow_always", "reject_always"]);
var PATTERN = /[*?[\]{}\\]/;
var consentStrings = ["capability", "resource", "triggeringResource", "workspaceRoot"];
function unrecognizedMetadata(meta) {
  if (meta === void 0) return [];
  if (!isRecord(meta)) return ["_meta"];
  const found = Object.keys(meta).filter((key) => key !== "kiro").map((key) => `_meta.${key}`);
  const kiro = meta.kiro;
  if (kiro === void 0) return found;
  if (!isRecord(kiro)) return [...found, "_meta.kiro"];
  found.push(...Object.keys(kiro).filter((key) => !["consent", "mcpTool"].includes(key)).map((key) => `_meta.kiro.${key}`));
  const consent = kiro.consent;
  if (consent !== void 0 && !isRecord(consent)) found.push("_meta.kiro.consent");
  else if (consent !== void 0) {
    for (const key of Object.keys(consent)) {
      const known = consentStrings.includes(key) ? typeof consent[key] === "string" : key === "persistableConsent" && typeof consent[key] === "boolean";
      if (!known) found.push(`_meta.kiro.consent.${key}`);
    }
  }
  if (kiro.mcpTool !== void 0 && (!isRecord(kiro.mcpTool) || kiro.mcpTool.version !== 1)) found.push("_meta.kiro.mcpTool");
  return found;
}
function inspectPermission(params, workspaceRoot = null) {
  if (!isRecord(params) || typeof params.sessionId !== "string" || !isRecord(params.toolCall)) {
    return { supported: false, reason: "INVALID_PERMISSION" };
  }
  const call = params.toolCall;
  if (typeof call.toolCallId !== "string" || !call.toolCallId || call.title != null && typeof call.title !== "string" || call.kind != null && typeof call.kind !== "string") {
    return { supported: false, reason: "INVALID_ACTION_DETAILS" };
  }
  if (!Array.isArray(params.options) || !params.options.length) {
    return { supported: false, reason: "MISSING_OPTIONS" };
  }
  const ids = /* @__PURE__ */ new Set();
  for (const option of params.options) {
    if (!isRecord(option) || typeof option.optionId !== "string" || !option.optionId || typeof option.name !== "string" || !knownKinds.has(option.kind) || ids.has(option.optionId) || Object.keys(option).some((key) => !["optionId", "name", "kind"].includes(key))) {
      return { supported: false, reason: "UNKNOWN_OPTION_SEMANTICS" };
    }
    ids.add(option.optionId);
  }
  const unrecognized = unrecognizedMetadata(params._meta);
  const once = params.options.filter((option) => ["allow_once", "reject_once"].includes(option.kind));
  if (!once.length) return { supported: false, reason: "NO_ONE_TIME_OPTIONS" };
  const consent = params._meta?.kiro?.consent;
  const persistable = !unrecognized.length && isRecord(consent) && consent.persistableConsent === true && typeof consent.capability === "string" && consent.capability.length > 0 && typeof consent.resource === "string" && consent.resource.length > 0 && !PATTERN.test(consent.resource) && typeof workspaceRoot === "string" && consent.workspaceRoot === workspaceRoot;
  if (!persistable) return { supported: true, options: once, unrecognized, rule: null };
  const options = params.options.filter((option) => knownKinds.has(option.kind));
  return { supported: true, options, unrecognized, rule: { capability: consent.capability, resource: consent.resource, workspaceRoot } };
}
var isPersistent = (option) => option.kind === "allow_always" || option.kind === "reject_always";
var cancelledPermission = () => ({ outcome: { outcome: "cancelled" } });
var selectedPermission = (optionId, rule = null) => rule ? { outcome: { outcome: "selected", optionId }, _meta: { kiro: { consent: { scope: "workspace", resource: rule.resource, workspaceRoot: rule.workspaceRoot } } } } : { outcome: { outcome: "selected", optionId } };

// src/process.js
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
var AGENT_ARGS = Object.freeze(["acp", "--agent-engine=v3", "--auth-method=cli"]);
async function validateExecutable(path) {
  if (typeof path !== "string" || !(0, import_node_path.isAbsolute)(path)) throw new OperationalError("ABSOLUTE_EXECUTABLE_REQUIRED");
  try {
    if (!(await (0, import_promises.stat)(path)).isFile()) throw new Error();
    await (0, import_promises.access)(path, import_node_fs.constants.X_OK);
  } catch {
    throw new OperationalError("EXECUTABLE_NOT_AVAILABLE");
  }
}
function launchAgent(executable, cwd) {
  if (process.platform !== "darwin") throw new OperationalError("MACOS_REQUIRED");
  return (0, import_node_child_process.spawn)(executable, [...AGENT_ARGS], {
    cwd,
    shell: false,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"]
    // Inherit the normal OS environment. No plugin credentials or overrides.
  });
}
function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}
function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw new OperationalError("GROUP_SIGNAL_FAILED");
  }
}
var pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function terminateOwnedProcess(child, graceMs = LIMITS.shutdownMs) {
  if (!child.pid) {
    child.stdin?.destroy();
    child.stdout?.destroy();
    child.stderr?.destroy();
    return;
  }
  const pid = child.pid;
  signalGroup(pid, "SIGTERM");
  const deadline = Date.now() + graceMs;
  while (groupExists(pid) && Date.now() < deadline) await pause(20);
  if (groupExists(pid)) signalGroup(pid, "SIGKILL");
  const killDeadline = Date.now() + graceMs;
  while (groupExists(pid) && Date.now() < killDeadline) await pause(20);
  child.stdin?.destroy();
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (groupExists(pid) || child.exitCode === null && child.signalCode === null) {
    throw new OperationalError("CLEANUP_UNCERTAIN");
  }
}

// src/acp.js
var validId = (id) => typeof id === "string" && id.length > 0 || Number.isSafeInteger(id);
var idKey = (id) => `${typeof id}:${id}`;
var label = (value, max = 1024) => typeof value === "string" && value.length > 0 && value.length <= max;
function configValue(entry, group) {
  if (!isRecord(entry) || !label(entry.value) || !label(entry.name)) return null;
  const value = { value: entry.value, name: entry.name };
  if (label(entry.description)) value.description = entry.description;
  if (group) value.group = group;
  return value;
}
function sanitizeConfigOptions(input, limits = LIMITS) {
  if (!Array.isArray(input)) return [];
  const options = [];
  for (const entry of input.slice(0, limits.configOptions)) {
    if (!isRecord(entry) || entry.type !== "select" || !label(entry.id) || !label(entry.name) || !Array.isArray(entry.options) || options.some((option2) => option2.id === entry.id)) continue;
    const values = [];
    for (const item of entry.options) {
      if (isRecord(item) && Array.isArray(item.options)) {
        for (const nested of item.options.slice(0, limits.configValues - values.length)) {
          values.push(configValue(nested, label(item.name) ? item.name : ""));
        }
      } else values.push(configValue(item, ""));
      if (values.length >= limits.configValues) break;
    }
    const valid = values.filter(Boolean).slice(0, limits.configValues);
    if (!valid.some((value) => value.value === entry.currentValue)) continue;
    const option = { id: entry.id, name: entry.name, type: "select", currentValue: entry.currentValue, options: valid };
    if (label(entry.description)) option.description = entry.description;
    if (label(entry.category, 128)) option.category = entry.category;
    options.push(option);
  }
  return options;
}
var FrameReader = class {
  constructor(onFrame, limit = LIMITS.frame) {
    this.onFrame = onFrame;
    this.buffer = Buffer.alloc(limit);
    this.length = 0;
    this.limit = limit;
    this.decoder = new import_node_util.TextDecoder("utf-8", { fatal: true });
  }
  push(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      const newline2 = chunk.indexOf(10, offset);
      const end = newline2 < 0 ? chunk.length : newline2;
      const size = end - offset;
      if (this.length + size > this.limit) throw new OperationalError("FRAME_LIMIT");
      chunk.copy(this.buffer, this.length, offset, end);
      this.length += size;
      if (newline2 < 0) return;
      const frame = this.buffer.subarray(0, this.length);
      this.length = 0;
      if (frame.length) {
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
            if (++depth > 64) throw new OperationalError("JSON_DEPTH_LIMIT");
          } else if (byte === 125 || byte === 93) depth--;
        }
        let parsed;
        try {
          parsed = JSON.parse(this.decoder.decode(frame));
        } catch {
          throw new OperationalError("INVALID_FRAME");
        }
        this.onFrame(parsed, frame.length);
      }
      offset = newline2 + 1;
    }
  }
  finish() {
    if (this.length) throw new OperationalError("UNTERMINATED_FRAME");
  }
};
var AcpSession = class extends import_node_events.EventEmitter {
  constructor(child, { limits = LIMITS, terminate = terminateOwnedProcess } = {}) {
    super();
    this.child = child;
    this.limits = limits;
    this.terminate = terminate;
    this.state = "not-started";
    this.sessionId = null;
    this.cwd = null;
    this.configOptions = [];
    this.configSeq = 0;
    this.configStamp = 0;
    this.startupUpdates = [];
    this.pending = /* @__PURE__ */ new Map();
    this.expired = /* @__PURE__ */ new Map();
    this.permissions = /* @__PURE__ */ new Map();
    this.toolCalls = /* @__PURE__ */ new Map();
    this.seenPermissionIds = /* @__PURE__ */ new Set();
    this.nextId = 1;
    this.retainedBytes = 0;
    this.extraRetainedBytes = () => 0;
    this.stderr = Buffer.alloc(0);
    this.transportClosed = false;
    this.stopTimer = null;
    this.startupTimer = null;
    this.cleanup = null;
    this.reader = new FrameReader((frame, size) => this.receive(frame, size), limits.frame);
    child.stdout.on("data", (chunk) => {
      if (this.transportClosed) return;
      try {
        this.reader.push(chunk);
      } catch (error) {
        this.fail(error instanceof OperationalError ? error.code : "INVALID_FRAME");
      }
    });
    child.stderr.on("data", (chunk) => {
      if (this.transportClosed) return;
      const tail = chunk.subarray(Math.max(0, chunk.length - limits.stderr));
      this.stderr = Buffer.concat([this.stderr, tail]).subarray(-limits.stderr);
    });
    child.stdout.on("end", () => {
      if (this.transportClosed) return;
      try {
        this.reader.finish();
      } catch (error) {
        this.fail(error.code);
        return;
      }
      this.fail("TRANSPORT_LOST");
    });
    child.on("error", () => this.fail("PROCESS_FAILED"));
    child.on("exit", () => {
      if (!this.transportClosed) this.fail("PROCESS_EXITED");
    });
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      stream.on("error", () => {
        if (!this.transportClosed) this.fail("TRANSPORT_LOST");
      });
    }
  }
  setState(state) {
    this.state = state;
    this.emit("state", state);
  }
  retain(bytes) {
    if (this.retainedBytes + bytes + this.extraRetainedBytes() > this.limits.session) throw new OperationalError("SESSION_LIMIT");
    this.retainedBytes += bytes;
  }
  write(frame) {
    if (this.transportClosed || this.child.stdin.destroyed) throw new OperationalError("TRANSPORT_CLOSED");
    const encoded = JSON.stringify(frame) + "\n";
    if (Buffer.byteLength(encoded) > this.limits.frame || this.child.stdin.writableLength + Buffer.byteLength(encoded) > this.limits.frame) {
      throw new OperationalError("OUTGOING_LIMIT");
    }
    this.child.stdin.write(encoded);
  }
  // With a deadline, a silent agent cannot hold the caller forever. A reply
  // that arrives after it is ignored, or handed to `late` when it succeeded.
  request(method, params, { timeoutMs = 0, late = null } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null };
      if (timeoutMs) entry.timer = setTimeout(() => {
        if (this.pending.get(id) !== entry) return;
        this.pending.delete(id);
        reject(new OperationalError("REQUEST_TIMEOUT"));
        if (this.expired.size >= this.limits.permissions) this.fail("REQUEST_TIMEOUT");
        else this.expired.set(id, late);
      }, timeoutMs);
      this.pending.set(id, entry);
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
        reject(error);
        this.fail(error.code || "WRITE_FAILED");
      }
    });
  }
  notify(method, params) {
    this.write({ jsonrpc: "2.0", method, params });
  }
  reply(id, result) {
    this.write({ jsonrpc: "2.0", id, result });
  }
  receive(frame, bytes) {
    if (this.transportClosed) return;
    if (!isRecord(frame) || frame.jsonrpc !== "2.0") throw new OperationalError("INVALID_RPC");
    this.retain(bytes);
    if (typeof frame.method === "string") {
      if (Object.hasOwn(frame, "id")) {
        if (!validId(frame.id)) throw new OperationalError("INVALID_REQUEST_ID");
        if (frame.method === "session/request_permission") this.permission(frame.id, frame.params);
        else this.write({ jsonrpc: "2.0", id: frame.id, error: { code: -32601, message: "Client method unsupported" } });
        return;
      }
      if (frame.method === "session/update") {
        if (!isRecord(frame.params) || !isRecord(frame.params.update)) throw new OperationalError("INVALID_UPDATE");
        if (this.state === "starting" && this.sessionId === null) this.startupUpdates.push(frame.params);
        else if (frame.params.sessionId === this.sessionId) this.deliver(frame.params.update);
      }
      return;
    }
    if (!validId(frame.id) || Object.hasOwn(frame, "result") === Object.hasOwn(frame, "error")) {
      throw new OperationalError("INVALID_RESPONSE");
    }
    const pending = this.pending.get(frame.id);
    if (!pending) {
      if (!this.expired.has(frame.id)) throw new OperationalError("UNMATCHED_RESPONSE");
      const late = this.expired.get(frame.id);
      this.expired.delete(frame.id);
      if (late && Object.hasOwn(frame, "result")) late(frame.result);
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(frame.id);
    if (Object.hasOwn(frame, "error")) pending.reject(new OperationalError("AGENT_REQUEST_FAILED"));
    else pending.resolve(frame.result);
  }
  deliver(update) {
    if (update.sessionUpdate === "config_option_update") {
      this.setConfigOptions(update.configOptions);
      return;
    }
    this.rememberToolCall(update);
    this.emit("update", update);
  }
  setConfigOptions(input, stamp = ++this.configSeq) {
    this.configOptions = sanitizeConfigOptions(input, this.limits);
    this.configStamp = stamp;
    this.emit("config-options", this.configOptions);
  }
  rememberToolCall(update) {
    if (!["tool_call", "tool_call_update"].includes(update?.sessionUpdate) || typeof update.toolCallId !== "string") return;
    const call = this.mergeToolCall(update, update.sessionUpdate === "tool_call" ? {} : this.toolCalls.get(update.toolCallId));
    this.retain(Buffer.byteLength(JSON.stringify(call)));
    this.toolCalls.set(update.toolCallId, call);
  }
  mergeToolCall(update, previous = {}) {
    return mergeDefined(mergeDefined({}, previous), update);
  }
  permission(id, params) {
    const key = idKey(id);
    if (this.seenPermissionIds.has(key)) throw new OperationalError("DUPLICATE_PERMISSION");
    this.seenPermissionIds.add(key);
    if (params?.sessionId !== this.sessionId || !["working", "waiting-for-approval"].includes(this.state)) {
      this.reply(id, cancelledPermission());
      return;
    }
    if (this.permissions.size >= this.limits.permissions) {
      this.reply(id, cancelledPermission());
      throw new OperationalError("PERMISSION_LIMIT");
    }
    const resolved = isRecord(params?.toolCall) ? { ...params, toolCall: this.mergeToolCall(params.toolCall, this.toolCalls.get(params.toolCall.toolCallId)) } : params;
    const inspected = inspectPermission(resolved, this.cwd);
    if (!inspected.supported) {
      this.reply(id, cancelledPermission());
      this.emit("unsupported-permission", inspected.reason);
      return;
    }
    const card = { id, params: resolved, request: params, options: inspected.options, unrecognized: inspected.unrecognized, rule: inspected.rule };
    this.permissions.set(key, card);
    this.setState("waiting-for-approval");
    this.emit("permission", card);
  }
  decide(id, optionId) {
    const key = idKey(id);
    const card = this.permissions.get(key);
    const active = this.permissions.values().next().value;
    const option = card?.options.find((entry) => entry.optionId === optionId);
    if (this.state !== "waiting-for-approval" || !card || active !== card || !option) return false;
    this.permissions.delete(key);
    this.reply(id, selectedPermission(optionId, isPersistent(option) ? card.rule : null));
    this.setState(this.permissions.size ? "waiting-for-approval" : "working");
    this.emit("permission-settled", id);
    return true;
  }
  cancelPermissions() {
    const cards = [...this.permissions.values()];
    this.permissions.clear();
    for (const card of cards) {
      try {
        this.reply(card.id, cancelledPermission());
      } catch {
      }
    }
    this.emit("permissions-cancelled");
  }
  // Initialize only. A chat is then opened, new or past, with open(), so past
  // chats can be listed without creating an empty session first.
  async connect() {
    if (this.state !== "not-started") throw new OperationalError("START_NOT_AVAILABLE");
    this.setState("starting");
    this.startupTimer = setTimeout(() => this.fail("STARTUP_TIMEOUT"), this.limits.startupMs);
    try {
      const initialized = await this.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "sir-scribbles", version: "0.0.1" }
      });
      if (!isRecord(initialized) || initialized.protocolVersion !== 1 || !isRecord(initialized.agentCapabilities)) {
        throw new OperationalError("INCOMPATIBLE_PROTOCOL");
      }
      if (this.transportClosed) throw new OperationalError("TRANSPORT_CLOSED");
      this.identity = initialized.agentInfo ?? null;
      this.capabilities = initialized.agentCapabilities;
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
      this.setState("connected");
      return { identity: this.identity, capabilities: this.capabilities };
    } catch (error) {
      this.fail(error.code || "START_FAILED");
      if (this.cleanup) await this.cleanup;
      throw error;
    }
  }
  canList() {
    return isRecord(this.capabilities?.sessionCapabilities) && isRecord(this.capabilities.sessionCapabilities.list);
  }
  canLoad() {
    return this.capabilities?.loadSession === true;
  }
  // Past chats for this directory, newest first. A refused listing leaves the
  // agent usable; entries from other directories or without an ID are dropped.
  async listSessions(cwd) {
    if (!["connected", "ready"].includes(this.state)) throw new OperationalError("HISTORY_NOT_AVAILABLE");
    if (!this.canList()) throw new OperationalError("HISTORY_NOT_SUPPORTED");
    const entries = [];
    let cursor;
    for (let page = 0; page < this.limits.historyPages && entries.length < this.limits.historyEntries; page++) {
      let result;
      try {
        result = await this.request("session/list", cursor ? { cwd, cursor } : { cwd }, { timeoutMs: this.limits.requestMs });
      } catch (error) {
        if (this.transportClosed) throw error;
        throw new OperationalError(error.code === "REQUEST_TIMEOUT" ? "HISTORY_TIMEOUT" : "HISTORY_UNAVAILABLE");
      }
      if (!isRecord(result) || !Array.isArray(result.sessions)) throw new OperationalError("HISTORY_UNAVAILABLE");
      for (const item of result.sessions) {
        if (entries.length >= this.limits.historyEntries) break;
        if (!isRecord(item) || !label(item.sessionId) || item.cwd !== cwd || entries.some((entry) => entry.sessionId === item.sessionId)) continue;
        const updated = typeof item.updatedAt === "string" ? Date.parse(item.updatedAt) : NaN;
        entries.push({ sessionId: item.sessionId, title: label(item.title, 512) ? item.title : "", updatedAt: Number.isFinite(updated) ? updated : null });
      }
      if (!label(result.nextCursor)) break;
      cursor = result.nextCursor;
    }
    return entries.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }
  // Opens a new chat, or loads a past one. Loading replays its history as
  // ordinary session updates before the response arrives.
  async open(cwd, sessionId = null) {
    if (this.state !== "connected") throw new OperationalError("START_NOT_AVAILABLE");
    if (sessionId !== null && (!this.canLoad() || !label(sessionId))) throw new OperationalError("LOAD_NOT_SUPPORTED");
    this.cwd = cwd;
    this.setState("starting");
    this.startupTimer = setTimeout(() => this.fail("STARTUP_TIMEOUT"), sessionId ? this.limits.loadMs : this.limits.startupMs);
    try {
      let session;
      if (sessionId) {
        this.sessionId = sessionId;
        session = await this.request("session/load", { sessionId, cwd, mcpServers: [] });
        if (!isRecord(session)) throw new OperationalError("INVALID_SESSION");
      } else {
        session = await this.request("session/new", { cwd, mcpServers: [] });
        if (!isRecord(session) || typeof session.sessionId !== "string" || !session.sessionId) {
          throw new OperationalError("INVALID_SESSION");
        }
      }
      if (this.transportClosed) throw new OperationalError("TRANSPORT_CLOSED");
      this.sessionId = sessionId ?? session.sessionId;
      this.configOptions = sanitizeConfigOptions(session.configOptions, this.limits);
      const startupUpdates = this.startupUpdates;
      this.startupUpdates = [];
      for (const params of startupUpdates) {
        if (params.sessionId === this.sessionId) this.deliver(params.update);
      }
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
      this.setState("ready");
      return { identity: this.identity, capabilities: this.capabilities, configOptions: this.configOptions };
    } catch (error) {
      this.fail(error.code || "START_FAILED");
      if (this.cleanup) await this.cleanup;
      throw error;
    }
  }
  async start(cwd, sessionId = null) {
    await this.connect();
    return this.open(cwd, sessionId);
  }
  async prompt(text2) {
    if (this.state !== "ready") throw new OperationalError("PROMPT_NOT_AVAILABLE");
    if (typeof text2 !== "string" || !text2.trim()) throw new OperationalError("EMPTY_PROMPT");
    if (Buffer.byteLength(text2) > this.limits.prompt) throw new OperationalError("PROMPT_LIMIT");
    try {
      this.retain(Buffer.byteLength(text2));
    } catch (error) {
      this.fail(error.code);
      throw error;
    }
    this.toolCalls.clear();
    this.setState("working");
    try {
      const response = await this.request("session/prompt", { sessionId: this.sessionId, prompt: [{ type: "text", text: text2 }] });
      if (!isRecord(response) || typeof response.stopReason !== "string") throw new OperationalError("INVALID_PROMPT_RESPONSE");
      return response;
    } catch (error) {
      if (!this.transportClosed) this.fail(error.code || "PROMPT_FAILED");
      throw error;
    } finally {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
      this.cancelPermissions();
      this.toolCalls.clear();
      if (!this.transportClosed) this.setState("ready");
    }
  }
  // Only between turns, and only to a value the agent offered. A rejected
  // change leaves the session usable; the agent keeps its previous value.
  async setConfigOption(configId, value) {
    if (this.state !== "ready") throw new OperationalError("CONFIG_NOT_AVAILABLE");
    const option = this.configOptions.find((entry) => entry.id === configId);
    if (!option?.options.some((entry) => entry.value === value)) throw new OperationalError("CONFIG_VALUE_UNKNOWN");
    let result;
    const seq = ++this.configSeq;
    const late = (result2) => {
      if (!this.transportClosed && seq > this.configStamp && isRecord(result2) && Array.isArray(result2.configOptions)) {
        this.setConfigOptions(result2.configOptions, seq);
      }
    };
    try {
      result = await this.request("session/set_config_option", { sessionId: this.sessionId, configId, value }, { timeoutMs: this.limits.requestMs, late });
    } catch (error) {
      if (this.transportClosed) throw error;
      throw new OperationalError(error.code === "REQUEST_TIMEOUT" ? "CONFIG_TIMEOUT" : "CONFIG_REJECTED");
    }
    if (this.transportClosed) throw new OperationalError("TRANSPORT_CLOSED");
    if (!isRecord(result) || !Array.isArray(result.configOptions)) throw new OperationalError("CONFIG_REJECTED");
    this.setConfigOptions(result.configOptions, seq);
    return this.configOptions;
  }
  stop() {
    if (["starting", "connected"].includes(this.state)) {
      this.close();
      return;
    }
    if (!["working", "waiting-for-approval"].includes(this.state)) return;
    this.setState("stopping");
    this.cancelPermissions();
    try {
      this.notify("session/cancel", { sessionId: this.sessionId });
    } catch {
      this.fail("CANCEL_FAILED");
      return;
    }
    this.stopTimer = setTimeout(() => {
      if (this.state === "stopping") this.emit("force-stop-available");
    }, this.limits.cancellationMs);
  }
  fail(code2) {
    if (this.transportClosed) return;
    this.shutdown("failed", code2);
  }
  shutdown(state, code2) {
    this.cancelPermissions();
    this.toolCalls.clear();
    this.transportClosed = true;
    clearTimeout(this.startupTimer);
    clearTimeout(this.stopTimer);
    this.startupTimer = this.stopTimer = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new OperationalError(code2));
    }
    this.pending.clear();
    this.expired.clear();
    this.startupUpdates = [];
    this.setState(state);
    this.emit("failure", code2);
    this.cleanup = this.terminate(this.child, this.limits.shutdownMs).then(() => {
      this.emit("cleanup", "observed");
      this.stderr = Buffer.alloc(0);
    }).catch(() => {
      this.emit("cleanup", "uncertain");
      return false;
    });
  }
  async close() {
    if (!this.transportClosed) this.shutdown("terminated", "SESSION_CLOSED");
    return this.cleanup;
  }
};

// src/draft.js
var import_node_crypto = require("node:crypto");
function captureSelection(view, eligible) {
  if (!view || !eligible(view) || !view.file || view.file.extension !== "md" || !view.editor) {
    throw new OperationalError("SELECT_TEXT_FIRST");
  }
  const text2 = view.editor.getSelection();
  if (!text2) throw new OperationalError("SELECT_TEXT_FIRST");
  const from = view.editor.getCursor("from");
  const to = view.editor.getCursor("to");
  const path = view.file.path;
  if (typeof path !== "string" || path.startsWith("/") || path.split("/").includes("..")) {
    throw new OperationalError("INVALID_SELECTION_SOURCE");
  }
  const snapshot = Object.freeze({
    path,
    from: from.line + 1,
    to: Math.max(from.line + 1, to.line + (to.ch > 0 ? 1 : 0)),
    text: text2
  });
  composePrompt("", snapshot);
  return snapshot;
}
function captureFile(view, eligible) {
  if (!view || !eligible(view) || !view.file || view.file.extension !== "md" || !view.editor) {
    throw new OperationalError("OPEN_NOTE_FIRST");
  }
  const path = view.file.path;
  if (typeof path !== "string" || path.startsWith("/") || path.split("/").includes("..")) {
    throw new OperationalError("INVALID_SELECTION_SOURCE");
  }
  const snapshot = Object.freeze({ kind: "file", path });
  composePrompt("", snapshot);
  return snapshot;
}
var selectionMarker = () => (0, import_node_crypto.randomBytes)(6).toString("hex");
function composePrompt(text2, selection, file = null, marker = selectionMarker()) {
  const parts = [];
  if (text2.trim()) parts.push(text2);
  if (file) parts.push(`Attached note path: ${file.path}`);
  if (selection?.kind === "file") parts.push(`Attached note path: ${selection.path}`);
  else if (selection) parts.push(`Selected note text (${selection.path}, lines ${selection.from}\u2013${selection.to}):
--- BEGIN SELECTED TEXT ${marker} ---
${selection.text}
--- END SELECTED TEXT ${marker} ---`);
  const prompt = parts.join("\n\n");
  if (!prompt) throw new OperationalError("EMPTY_PROMPT");
  if (Buffer.byteLength(prompt, "utf8") > LIMITS.prompt) throw new OperationalError("PROMPT_LIMIT");
  return prompt;
}

// src/chat.js
var ERROR_TEXT = {
  ABSOLUTE_EXECUTABLE_REQUIRED: "Choose the absolute path to your installed agent executable.",
  EXECUTABLE_NOT_AVAILABLE: "That file is unavailable or not executable. Change the agent path in Settings \u2192 Community plugins \u2192 Sir Scribbles, then start a new chat to retry.",
  MACOS_REQUIRED: "This preview supports macOS desktop only.",
  STARTUP_TIMEOUT: "The agent did not become ready within 15 seconds. Check its login and installation, then start a new chat.",
  INCOMPATIBLE_PROTOCOL: "The agent returned an unsupported protocol. Check its installation and version.",
  AGENT_REQUEST_FAILED: "The agent could not complete the request. Check its login in your terminal and its version. Previous execution may have occurred.",
  SELECT_TEXT_FIRST: "Select text in a Markdown note first, then attach it here.",
  OPEN_NOTE_FIRST: "Open a Markdown note first, then attach it here.",
  PROMPT_LIMIT: "The prompt and attached context exceed 128 KiB. Shorten the draft or attach less context; nothing was sent.",
  EMPTY_PROMPT: "Write a prompt or attach context first.",
  FRAME_LIMIT: "The agent exceeded the incoming message limit. The connection was ended.",
  SESSION_LIMIT: "This conversation exceeded its memory budget. Start a new chat.",
  PERMISSION_LIMIT: "The agent exceeded the approval queue limit. The connection was ended.",
  CLEANUP_UNCERTAIN: "Agent cleanup could not be confirmed. Force stop again before starting another process.",
  TRANSPORT_LOST: "The agent connection was lost. The previous task outcome may be uncertain. Start a new chat; no prompt will be replayed.",
  PROCESS_EXITED: "The agent exited. Check its login and installation in your terminal. The previous task outcome may be uncertain.",
  PROCESS_FAILED: "The agent could not start. Check the executable, its login and installation.",
  CONFIG_REJECTED: "The agent did not change the model. It keeps the previous one.",
  CONFIG_VALUE_UNKNOWN: "The agent no longer offers that model. Choose another one.",
  CONFIG_TIMEOUT: "The agent did not confirm the model change within 15 seconds. It may still apply it; the picker shows the model it last reported.",
  HISTORY_TIMEOUT: "The agent did not list past chats within 15 seconds. Try again, or start a new chat.",
  HISTORY_NOT_SUPPORTED: "This agent cannot list past chats. Start a new chat instead.",
  HISTORY_UNAVAILABLE: "The agent could not list past chats. Try again, or start a new chat.",
  LOAD_NOT_SUPPORTED: "This agent cannot reopen past chats. Start a new chat instead."
};
var titleOf = (text2) => {
  const line = text2.split("\n").map((part) => part.trim()).find(Boolean) ?? "";
  return line.length > 48 ? `${line.slice(0, 47)}\u2026` : line;
};
var errorText = (code2) => ERROR_TEXT[code2] ?? `The agent stopped (${code2 || "UNKNOWN_ERROR"}). The previous task outcome may be uncertain. Start a new chat.`;
var ChatController = class extends import_node_events2.EventEmitter {
  constructor(cwd, { launch = launchAgent, validate = validateExecutable, createSession = (child) => new AcpSession(child), getSourcePath = () => "" } = {}) {
    super();
    this.cwd = cwd;
    this.launch = launch;
    this.validate = validate;
    this.createSession = createSession;
    this.getSourcePath = getSourcePath;
    this.turnSourcePath = "";
    this.state = "not-started";
    this.session = null;
    this.messages = [];
    this.tools = /* @__PURE__ */ new Map();
    this.draft = "";
    this.selection = null;
    this.file = null;
    this.identity = "";
    this.configOptions = [];
    this.configPending = false;
    this.error = "";
    this.cleanup = "";
    this.forceAvailable = false;
    this.generation = 0;
    this.disposed = false;
    this.resetting = false;
    this.uiBytes = 0;
    this.title = "";
    this.history = null;
    this.loading = false;
  }
  changed() {
    this.emit("change");
  }
  setDraft(text2) {
    this.draft = text2;
  }
  // Typing never launches or recreates the composer.
  attach(selection) {
    const file = selection.kind === "file" ? selection : this.file;
    const textSelection = selection.kind === "file" ? this.selection : selection;
    composePrompt(this.draft, textSelection, file);
    this.selection = textSelection;
    this.file = file;
    this.error = "";
    this.changed();
  }
  removeFile() {
    this.file = null;
    this.changed();
  }
  removeSelection() {
    this.selection = null;
    this.changed();
  }
  // The session's model choice, if the agent offers one as a config option.
  modelOption() {
    return this.configOptions.find((option) => option.category === "model") ?? null;
  }
  activePermission() {
    return this.session?.permissions.values().next().value ?? null;
  }
  setError(code2) {
    this.error = errorText(code2);
    this.changed();
  }
  // Launches the agent and initializes it, without opening a chat yet.
  async connect(executable) {
    if (this.disposed || this.resetting || this.state !== "not-started" || this.session) return;
    const generation = ++this.generation;
    this.state = "starting";
    this.error = "";
    this.cleanup = "";
    this.changed();
    try {
      await this.validate(executable);
      if (this.disposed || generation !== this.generation) return;
      const session = this.createSession(this.launch(executable, this.cwd));
      this.session = session;
      session.extraRetainedBytes = () => this.uiBytes;
      const live = () => !this.disposed && generation === this.generation;
      session.on("state", (state) => {
        if (live()) {
          this.state = state;
          this.changed();
        }
      });
      session.on("update", (update) => {
        if (live()) this.update(update);
      });
      session.on("config-options", (options) => {
        if (live()) {
          this.configOptions = options;
          this.changed();
        }
      });
      for (const event of ["permission", "permission-settled", "permissions-cancelled"]) {
        session.on(event, () => {
          if (live()) this.changed();
        });
      }
      session.on("unsupported-permission", (code2) => {
        if (live()) {
          this.error = `Unsupported approval (${code2}). The request was cancelled.`;
          this.changed();
        }
      });
      session.on("force-stop-available", () => {
        if (live()) {
          this.forceAvailable = true;
          this.changed();
        }
      });
      session.on("failure", (code2) => {
        if (live() && code2 !== "SESSION_CLOSED") {
          this.error = errorText(code2);
          this.changed();
        }
      });
      session.on("cleanup", (result) => {
        if (live()) {
          this.cleanup = result;
          if (result === "uncertain") {
            this.error = errorText("CLEANUP_UNCERTAIN");
            this.forceAvailable = true;
          }
          this.changed();
        }
      });
      const initialized = await session.connect();
      if (live()) {
        this.identity = [initialized.identity?.title ?? initialized.identity?.name, initialized.identity?.version].filter((value) => typeof value === "string").join(" \xB7 ");
        this.changed();
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.state = this.session ? "failed" : "not-started";
        this.setError(error.code || "PROCESS_FAILED");
      }
    }
  }
  async start(executable) {
    await this.connect(executable);
    if (this.state === "connected") await this.open();
  }
  // Lists this vault's past chats so the user can reopen one. Starts the
  // agent when needed; the chat itself is opened only on a choice.
  async browse(executable = "") {
    if (this.disposed || this.resetting || this.history?.pending) return;
    if (this.state === "not-started") {
      if (!executable) return;
      await this.connect(executable);
    }
    if (this.state !== "connected" || this.disposed || this.resetting) return;
    const session = this.session;
    const generation = this.generation;
    this.history = { pending: true };
    this.error = "";
    this.changed();
    let history;
    if (!session.canLoad()) history = { error: errorText("LOAD_NOT_SUPPORTED") };
    else try {
      history = { entries: await session.listSessions(this.cwd) };
    } catch (error) {
      history = { error: errorText(error.code), retry: error.code !== "HISTORY_NOT_SUPPORTED" };
    }
    if (generation !== this.generation || this.disposed || this.state !== "connected") return;
    this.history = history;
    this.changed();
  }
  // Opens a new chat, or reopens a past one by its session ID.
  async open(sessionId = null, title = "") {
    if (this.disposed || this.resetting || this.state !== "connected" || this.history?.pending) return;
    const session = this.session;
    const generation = this.generation;
    const live = () => !this.disposed && generation === this.generation;
    this.loading = Boolean(sessionId);
    if (sessionId) this.title = title;
    this.error = "";
    this.changed();
    try {
      const opened = await session.open(this.cwd, sessionId);
      if (live()) {
        this.history = null;
        this.configOptions = opened.configOptions ?? [];
      }
    } catch (error) {
      if (live()) {
        if (!session.transportClosed && session.state === "connected") this.state = "connected";
        else this.state = "failed";
        this.setError(error.code || "START_FAILED");
      }
    } finally {
      if (live()) {
        this.loading = false;
        this.changed();
      }
    }
  }
  retainUi(bytes) {
    if (this.uiBytes + bytes + (this.session?.retainedBytes ?? 0) > LIMITS.session) {
      this.session?.fail("SESSION_LIMIT");
      return false;
    }
    this.uiBytes += bytes;
    return true;
  }
  update(update) {
    const kind = update.sessionUpdate;
    const role = kind === "agent_message_chunk" ? "agent" : kind === "user_message_chunk" && this.loading ? "user" : "";
    if (role && update.content?.type === "text" && typeof update.content.text === "string") {
      const text2 = update.content.text;
      if (!this.retainUi(Buffer.byteLength(text2))) return;
      const last = this.messages.at(-1);
      const messageId = typeof update.messageId === "string" ? update.messageId : void 0;
      if (last?.role === role && last.messageId === messageId) last.text += text2;
      else this.messages.push({ role, text: text2, messageId, timestamp: this.loading ? null : Date.now(), sourcePath: this.turnSourcePath });
      if (role === "user" && !this.title) this.title = titleOf(text2);
    } else if (kind === "session_info_update" && typeof update.title === "string" && update.title.trim()) {
      this.title = titleOf(update.title);
    } else if (["tool_call", "tool_call_update"].includes(update.sessionUpdate) && typeof update.toolCallId === "string") {
      const previous = this.tools.get(update.toolCallId);
      const data = mergeDefined(mergeDefined({}, previous?.data ?? {}), update);
      const text2 = JSON.stringify(data);
      if (!this.retainUi(Buffer.byteLength(text2))) return;
      if (previous) {
        previous.data = data;
        previous.text = text2;
      } else {
        const entry = { role: "tool", data, text: text2, timestamp: this.loading ? null : Date.now() };
        this.tools.set(update.toolCallId, entry);
        this.messages.push(entry);
      }
    } else return;
    this.changed();
  }
  async send(executable = "") {
    if (this.resetting || this.disposed || this.configPending || this.history?.pending || !["not-started", "connected", "ready"].includes(this.state)) return;
    if (this.state === "not-started" && !executable) return;
    let prompt;
    try {
      prompt = composePrompt(this.draft, this.selection, this.file);
    } catch (error) {
      this.setError(error.code);
      return;
    }
    const originalDraft = this.draft;
    const originalSelection = this.selection;
    const originalFile = this.file;
    const sourcePath = this.selection?.path ?? this.file?.path ?? this.getSourcePath();
    if (this.state !== "ready") {
      const starting = this.state === "connected" ? this.open() : this.start(executable);
      const startupGeneration = this.generation;
      await starting;
      if (this.disposed || this.resetting || this.generation !== startupGeneration || this.state !== "ready") return;
      if (this.draft !== originalDraft || this.selection !== originalSelection || this.file !== originalFile) {
        this.error = "The draft changed while the agent was starting. Review it and send again.";
        this.changed();
        return;
      }
    }
    const session = this.session;
    const generation = this.generation;
    if (!this.retainUi(Buffer.byteLength(prompt))) return;
    this.turnSourcePath = sourcePath;
    if (!this.title) this.title = titleOf(originalDraft) || titleOf(sourcePath);
    this.messages.push({ role: "user", text: prompt, timestamp: Date.now() });
    this.draft = "";
    this.selection = null;
    this.file = null;
    this.error = "";
    this.forceAvailable = false;
    const turn = session.prompt(prompt);
    this.changed();
    try {
      await turn;
    } catch (error) {
      if (generation === this.generation && !this.disposed) {
        if (!this.draft && !this.selection && !this.file) {
          this.draft = originalDraft;
          this.selection = originalSelection;
          this.file = originalFile;
        }
        this.setError(error.code);
      }
    } finally {
      if (generation === this.generation && !this.disposed) this.changed();
    }
  }
  async setModel(value) {
    const option = this.modelOption();
    if (!option || this.state !== "ready" || this.configPending || this.resetting || this.disposed) return;
    if (value === option.currentValue) return;
    const session = this.session;
    const generation = this.generation;
    this.configPending = true;
    this.error = "";
    this.changed();
    try {
      await session.setConfigOption(option.id, value);
    } catch (error) {
      if (generation === this.generation && !this.disposed && !session.transportClosed) this.setError(error.code);
    } finally {
      if (generation === this.generation && !this.disposed) {
        this.configPending = false;
        this.changed();
      }
    }
  }
  decide(card, optionId) {
    if (this.resetting || this.disposed || card !== this.activePermission()) return false;
    try {
      return this.session.decide(card.id, optionId);
    } catch (error) {
      this.session.fail(error.code || "WRITE_FAILED");
      return false;
    }
  }
  stop() {
    if (this.state === "connected") {
      void this.newChat();
    } else if (this.state === "starting" && !this.session) {
      ++this.generation;
      this.state = "not-started";
      this.changed();
    } else this.session?.stop();
  }
  async forceStop() {
    if (!this.forceAvailable || this.resetting || !this.session) return;
    this.forceAvailable = false;
    this.state = "stopping";
    this.changed();
    if (this.cleanup === "uncertain") {
      try {
        await terminateOwnedProcess(this.session.child);
        this.cleanup = "observed";
      } catch {
        this.cleanup = "uncertain";
      }
    } else {
      const result = await this.session.close();
      this.cleanup = result === false ? "uncertain" : "observed";
    }
    this.state = "terminated";
    if (this.cleanup === "uncertain") {
      this.forceAvailable = true;
      this.setError("CLEANUP_UNCERTAIN");
    }
    this.changed();
  }
  async newChat() {
    if (this.resetting || this.disposed) return false;
    this.resetting = true;
    ++this.generation;
    this.state = "stopping";
    this.changed();
    const result = await this.session?.close();
    if (result === false && this.cleanup !== "observed") {
      this.resetting = false;
      this.state = "failed";
      this.cleanup = "uncertain";
      this.forceAvailable = true;
      this.setError("CLEANUP_UNCERTAIN");
      return false;
    }
    this.session?.removeAllListeners();
    this.session = null;
    this.messages = [];
    this.turnSourcePath = "";
    this.tools.clear();
    this.draft = "";
    this.selection = null;
    this.file = null;
    this.identity = "";
    this.configOptions = [];
    this.configPending = false;
    this.error = "";
    this.cleanup = "";
    this.uiBytes = 0;
    this.title = "";
    this.history = null;
    this.loading = false;
    this.forceAvailable = false;
    this.resetting = false;
    this.state = "not-started";
    this.changed();
    return true;
  }
  async dispose() {
    this.disposed = true;
    ++this.generation;
    this.draft = "";
    this.selection = null;
    this.file = null;
    this.messages = [];
    this.turnSourcePath = "";
    this.tools.clear();
    this.removeAllListeners();
    const result = await this.session?.close();
    this.session?.removeAllListeners();
    return result !== false || this.cleanup === "observed";
  }
  recoverCleanup() {
    this.disposed = false;
    this.state = "failed";
    this.cleanup = "uncertain";
    this.forceAvailable = true;
    this.error = errorText("CLEANUP_UNCERTAIN");
  }
};

// src/tabs.js
var import_node_events3 = require("node:events");

// node_modules/mdurl/index.mjs
var mdurl_exports = {};
__export(mdurl_exports, {
  decode: () => decode_default,
  encode: () => encode_default,
  format: () => format,
  parse: () => parse_default
});

// node_modules/mdurl/lib/decode.mjs
var decodeCache = {};
function getDecodeCache(exclude) {
  let cache = decodeCache[exclude];
  if (cache) {
    return cache;
  }
  cache = decodeCache[exclude] = [];
  for (let i = 0; i < 128; i++) {
    const ch = String.fromCharCode(i);
    cache.push(ch);
  }
  for (let i = 0; i < exclude.length; i++) {
    const ch = exclude.charCodeAt(i);
    cache[ch] = "%" + ("0" + ch.toString(16).toUpperCase()).slice(-2);
  }
  return cache;
}
function decode(string, exclude) {
  if (typeof exclude !== "string") {
    exclude = decode.defaultChars;
  }
  const cache = getDecodeCache(exclude);
  return string.replace(/(%[a-f0-9]{2})+/gi, function(seq) {
    let result = "";
    for (let i = 0, l = seq.length; i < l; i += 3) {
      const b1 = parseInt(seq.slice(i + 1, i + 3), 16);
      if (b1 < 128) {
        result += cache[b1];
        continue;
      }
      if ((b1 & 224) === 192 && i + 3 < l) {
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        if ((b2 & 192) === 128) {
          const chr = b1 << 6 & 1984 | b2 & 63;
          if (chr < 128) {
            result += "\uFFFD\uFFFD";
          } else {
            result += String.fromCharCode(chr);
          }
          i += 3;
          continue;
        }
      }
      if ((b1 & 240) === 224 && i + 6 < l) {
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
        if ((b2 & 192) === 128 && (b3 & 192) === 128) {
          const chr = b1 << 12 & 61440 | b2 << 6 & 4032 | b3 & 63;
          if (chr < 2048 || chr >= 55296 && chr <= 57343) {
            result += "\uFFFD\uFFFD\uFFFD";
          } else {
            result += String.fromCharCode(chr);
          }
          i += 6;
          continue;
        }
      }
      if ((b1 & 248) === 240 && i + 9 < l) {
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
        const b4 = parseInt(seq.slice(i + 10, i + 12), 16);
        if ((b2 & 192) === 128 && (b3 & 192) === 128 && (b4 & 192) === 128) {
          let chr = b1 << 18 & 1835008 | b2 << 12 & 258048 | b3 << 6 & 4032 | b4 & 63;
          if (chr < 65536 || chr > 1114111) {
            result += "\uFFFD\uFFFD\uFFFD\uFFFD";
          } else {
            chr -= 65536;
            result += String.fromCharCode(55296 + (chr >> 10), 56320 + (chr & 1023));
          }
          i += 9;
          continue;
        }
      }
      result += "\uFFFD";
    }
    return result;
  });
}
decode.defaultChars = ";/?:@&=+$,#";
decode.componentChars = "";
var decode_default = decode;

// node_modules/mdurl/lib/encode.mjs
var encodeCache = {};
function getEncodeCache(exclude) {
  let cache = encodeCache[exclude];
  if (cache) {
    return cache;
  }
  cache = encodeCache[exclude] = [];
  for (let i = 0; i < 128; i++) {
    const ch = String.fromCharCode(i);
    if (/^[0-9a-z]$/i.test(ch)) {
      cache.push(ch);
    } else {
      cache.push("%" + ("0" + i.toString(16).toUpperCase()).slice(-2));
    }
  }
  for (let i = 0; i < exclude.length; i++) {
    cache[exclude.charCodeAt(i)] = exclude[i];
  }
  return cache;
}
function encode(string, exclude, keepEscaped) {
  if (typeof exclude !== "string") {
    keepEscaped = exclude;
    exclude = encode.defaultChars;
  }
  if (typeof keepEscaped === "undefined") {
    keepEscaped = true;
  }
  const cache = getEncodeCache(exclude);
  let result = "";
  for (let i = 0, l = string.length; i < l; i++) {
    const code2 = string.charCodeAt(i);
    if (keepEscaped && code2 === 37 && i + 2 < l) {
      if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
        result += string.slice(i, i + 3);
        i += 2;
        continue;
      }
    }
    if (code2 < 128) {
      result += cache[code2];
      continue;
    }
    if (code2 >= 55296 && code2 <= 57343) {
      if (code2 >= 55296 && code2 <= 56319 && i + 1 < l) {
        const nextCode = string.charCodeAt(i + 1);
        if (nextCode >= 56320 && nextCode <= 57343) {
          result += encodeURIComponent(string[i] + string[i + 1]);
          i++;
          continue;
        }
      }
      result += "%EF%BF%BD";
      continue;
    }
    result += encodeURIComponent(string[i]);
  }
  return result;
}
encode.defaultChars = ";/?:@&=+$,-_.!~*'()#";
encode.componentChars = "-_.!~*'()";
var encode_default = encode;

// node_modules/mdurl/lib/format.mjs
function format(url) {
  let result = "";
  result += url.protocol || "";
  result += url.slashes ? "//" : "";
  result += url.auth ? url.auth + "@" : "";
  if (url.hostname && url.hostname.indexOf(":") !== -1) {
    result += "[" + url.hostname + "]";
  } else {
    result += url.hostname || "";
  }
  result += url.port ? ":" + url.port : "";
  result += url.pathname || "";
  result += url.search || "";
  result += url.hash || "";
  return result;
}

// node_modules/mdurl/lib/parse.mjs
function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.pathname = null;
}
var protocolPattern = /^([a-z0-9.+-]+:)/i;
var portPattern = /:[0-9]*$/;
var simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;
var delims = ["<", ">", '"', "`", " ", "\r", "\n", "	"];
var unwise = ["{", "}", "|", "\\", "^", "`"].concat(delims);
var autoEscape = ["'"].concat(unwise);
var nonHostChars = ["%", "/", "?", ";", "#"].concat(autoEscape);
var hostEndingChars = ["/", "?", "#"];
var hostnameMaxLen = 255;
var hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/;
var hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/;
var hostlessProtocol = {
  javascript: true,
  "javascript:": true
};
var slashedProtocol = {
  http: true,
  https: true,
  ftp: true,
  gopher: true,
  file: true,
  "http:": true,
  "https:": true,
  "ftp:": true,
  "gopher:": true,
  "file:": true
};
function urlParse(url, slashesDenoteHost) {
  if (url && url instanceof Url) return url;
  const u = new Url();
  u.parse(url, slashesDenoteHost);
  return u;
}
Url.prototype.parse = function(url, slashesDenoteHost) {
  let lowerProto, hec, slashes;
  let rest = url;
  rest = rest.trim();
  if (!slashesDenoteHost && url.split("#").length === 1) {
    const simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
      }
      return this;
    }
  }
  let proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    lowerProto = proto.toLowerCase();
    this.protocol = proto;
    rest = rest.substr(proto.length);
  }
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    slashes = rest.substr(0, 2) === "//";
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }
  if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
    let hostEnd = -1;
    for (let i = 0; i < hostEndingChars.length; i++) {
      hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }
    let auth, atSign;
    if (hostEnd === -1) {
      atSign = rest.lastIndexOf("@");
    } else {
      atSign = rest.lastIndexOf("@", hostEnd);
    }
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = auth;
    }
    hostEnd = -1;
    for (let i = 0; i < nonHostChars.length; i++) {
      hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }
    if (hostEnd === -1) {
      hostEnd = rest.length;
    }
    if (rest[hostEnd - 1] === ":") {
      hostEnd--;
    }
    const host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);
    this.parseHost(host);
    this.hostname = this.hostname || "";
    const ipv6Hostname = this.hostname[0] === "[" && this.hostname[this.hostname.length - 1] === "]";
    if (!ipv6Hostname) {
      const hostparts = this.hostname.split(/\./);
      for (let i = 0, l = hostparts.length; i < l; i++) {
        const part = hostparts[i];
        if (!part) {
          continue;
        }
        if (!part.match(hostnamePartPattern)) {
          let newpart = "";
          for (let j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              newpart += "x";
            } else {
              newpart += part[j];
            }
          }
          if (!newpart.match(hostnamePartPattern)) {
            const validParts = hostparts.slice(0, i);
            const notHost = hostparts.slice(i + 1);
            const bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = notHost.join(".") + rest;
            }
            this.hostname = validParts.join(".");
            break;
          }
        }
      }
    }
    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = "";
    }
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
    }
  }
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  const qm = rest.indexOf("?");
  if (qm !== -1) {
    this.search = rest.substr(qm);
    rest = rest.slice(0, qm);
  }
  if (rest) {
    this.pathname = rest;
  }
  if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
    this.pathname = "";
  }
  return this;
};
Url.prototype.parseHost = function(host) {
  let port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ":") {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) {
    this.hostname = host;
  }
};
var parse_default = urlParse;

// node_modules/uc.micro/build/index.mjs
var build_exports = {};
__export(build_exports, {
  Any: () => Any,
  Cc: () => Cc,
  Cf: () => Cf,
  P: () => P,
  S: () => S,
  Z: () => Z
});
var Any = /[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var Cc = /[\0-\x1F\x7F-\x9F]/;
var Cf = /[\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;
var P = /[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061D-\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B4E\u1B4F\u1B5A-\u1B60\u1B7D-\u1B7F\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52-\u2E5D\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDD6E\uDEAD\uDED0\uDF55-\uDF59\uDF86-\uDF89]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9\uDFD4\uDFD5\uDFD7\uDFD8]|\uD805[\uDC4B-\uDC4F\uDC5A\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDEB9\uDF3C-\uDF3E]|\uD806[\uDC3B\uDD44-\uDD46\uDDE2\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2\uDF00-\uDF09\uDFE1]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8\uDF43-\uDF4F\uDFFF]|\uD809[\uDC70-\uDC74]|\uD80B[\uDFF1\uDFF2]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDD6D-\uDD6F\uDE97-\uDE9A\uDFE2]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD839\uDDFF|\uD83A[\uDD5E\uDD5F]/;
var S = /[\$\+<->\^`\|~\xA2-\xA6\xA8\xA9\xAC\xAE-\xB1\xB4\xB8\xD7\xF7\u02C2-\u02C5\u02D2-\u02DF\u02E5-\u02EB\u02ED\u02EF-\u02FF\u0375\u0384\u0385\u03F6\u0482\u058D-\u058F\u0606-\u0608\u060B\u060E\u060F\u06DE\u06E9\u06FD\u06FE\u07F6\u07FE\u07FF\u0888\u09F2\u09F3\u09FA\u09FB\u0AF1\u0B70\u0BF3-\u0BFA\u0C7F\u0D4F\u0D79\u0E3F\u0F01-\u0F03\u0F13\u0F15-\u0F17\u0F1A-\u0F1F\u0F34\u0F36\u0F38\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE\u0FCF\u0FD5-\u0FD8\u109E\u109F\u1390-\u1399\u166D\u17DB\u1940\u19DE-\u19FF\u1B61-\u1B6A\u1B74-\u1B7C\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u2044\u2052\u207A-\u207C\u208A-\u208C\u20A0-\u20C1\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u214F\u218A\u218B\u2190-\u2307\u230C-\u2328\u232B-\u2429\u2440-\u244A\u249C-\u24E9\u2500-\u2767\u2794-\u27C4\u27C7-\u27E5\u27F0-\u2982\u2999-\u29D7\u29DC-\u29FB\u29FE-\u2B73\u2B76-\u2BFF\u2CE5-\u2CEA\u2E50\u2E51\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3004\u3012\u3013\u3020\u3036\u3037\u303E\u303F\u309B\u309C\u3190\u3191\u3196-\u319F\u31C0-\u31E5\u31EF\u3200-\u321E\u322A-\u3247\u3250\u3260-\u327F\u328A-\u32B0\u32C0-\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA700-\uA716\uA720\uA721\uA789\uA78A\uA828-\uA82B\uA836-\uA839\uAA77-\uAA79\uAB5B\uAB6A\uAB6B\uFB29\uFBB2-\uFBD2\uFD40-\uFD4F\uFD90\uFD91\uFDC8-\uFDCF\uFDFC-\uFDFF\uFE62\uFE64-\uFE66\uFE69\uFF04\uFF0B\uFF1C-\uFF1E\uFF3E\uFF40\uFF5C\uFF5E\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFC\uFFFD]|\uD800[\uDD37-\uDD3F\uDD79-\uDD89\uDD8C-\uDD8E\uDD90-\uDD9C\uDDA0\uDDD0-\uDDFC]|\uD802[\uDC77\uDC78\uDEC8]|\uD803[\uDD8E\uDD8F\uDED1-\uDED8]|\uD805\uDF3F|\uD807[\uDFD5-\uDFF1]|\uD81A[\uDF3C-\uDF3F\uDF45]|\uD82F\uDC9C|\uD833[\uDC00-\uDCEF\uDCFA-\uDCFC\uDD00-\uDEB3\uDEBA-\uDED0\uDEE0-\uDEF0\uDF50-\uDFC3]|\uD834[\uDC00-\uDCF5\uDD00-\uDD26\uDD29-\uDD64\uDD6A-\uDD6C\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDDEA\uDE00-\uDE41\uDE45\uDF00-\uDF56]|\uD835[\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85\uDE86]|\uD838[\uDD4F\uDEFF]|\uD83B[\uDCAC\uDCB0\uDD2E\uDEF0\uDEF1]|\uD83C[\uDC00-\uDC2B\uDC30-\uDC93\uDCA0-\uDCAE\uDCB1-\uDCBF\uDCC1-\uDCCF\uDCD1-\uDCF5\uDD0D-\uDDAD\uDDE6-\uDE02\uDE10-\uDE3B\uDE40-\uDE48\uDE50\uDE51\uDE60-\uDE65\uDF00-\uDFFF]|\uD83D[\uDC00-\uDED8\uDEDC-\uDEEC\uDEF0-\uDEFC\uDF00-\uDFD9\uDFE0-\uDFEB\uDFF0]|\uD83E[\uDC00-\uDC0B\uDC10-\uDC47\uDC50-\uDC59\uDC60-\uDC87\uDC90-\uDCAD\uDCB0-\uDCBB\uDCC0\uDCC1\uDCD0-\uDCD8\uDD00-\uDE57\uDE60-\uDE6D\uDE70-\uDE7C\uDE80-\uDE8A\uDE8E-\uDEC6\uDEC8\uDECD-\uDEDC\uDEDF-\uDEEA\uDEEF-\uDEF8\uDF00-\uDF92\uDF94-\uDFEF\uDFFA]/;
var Z = /[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

// node_modules/markdown-it/node_modules/entities/dist/decode-codepoint.js
var c1 = [
  8364,
  0,
  8218,
  402,
  8222,
  8230,
  8224,
  8225,
  710,
  8240,
  352,
  8249,
  338,
  0,
  381,
  0,
  0,
  8216,
  8217,
  8220,
  8221,
  8226,
  8211,
  8212,
  732,
  8482,
  353,
  8250,
  339,
  0,
  382,
  376
];
function isInvalidCodePoint(codePoint) {
  return codePoint === 0 || codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111;
}
function replaceCodePoint(codePoint) {
  if (isInvalidCodePoint(codePoint)) {
    return 65533;
  }
  if (codePoint >= 128 && codePoint <= 159) {
    return c1[codePoint - 128] || codePoint;
  }
  return codePoint;
}
function codePointToString(codePoint) {
  return codePoint - 1 >>> 0 < 127 || codePoint - 160 >>> 0 < 55136 ? String.fromCharCode(codePoint) : String.fromCodePoint(replaceCodePoint(codePoint));
}

// node_modules/markdown-it/node_modules/entities/dist/internal/decode-shared.js
var BASE91_INVERSE = /* @__PURE__ */ (() => {
  const table2 = new Uint8Array(127);
  let code2 = 0;
  for (let char = 33; char <= 126; char++) {
    if (char !== 34 && char !== 36 && char !== 92) {
      table2[char] = code2++;
    }
  }
  return table2;
})();
function decodeTrieDict(input, resultLength, atomCount, dict1AtomCount, ngramCount, dictSize) {
  const base = 91;
  const inputLength = input.length;
  const twoCharBias = dictSize * (base - 1);
  let pos = 0;
  const readSlotCode = () => {
    const c12 = BASE91_INVERSE[input.charCodeAt(pos++)];
    return c12 < dictSize ? c12 : c12 * base - twoCharBias + BASE91_INVERSE[input.charCodeAt(pos++)];
  };
  const dict2AtomCount = atomCount - dict1AtomCount;
  const slotCount = atomCount + ngramCount;
  const single = new Int32Array(slotCount);
  single.fill(-1, dict1AtomCount, dictSize);
  single.fill(-1, dictSize + dict2AtomCount, slotCount);
  const start = new Int32Array(slotCount);
  const length = new Int32Array(slotCount);
  function decodeDelta(count, off) {
    let previous = 0;
    let slot = off;
    const end = off + count;
    while (slot < end) {
      const code2 = BASE91_INVERSE[input.charCodeAt(pos++)];
      if (code2 < 89) {
        previous += code2;
        single[slot++] = previous;
      } else if (code2 === 89) {
        let runLength = BASE91_INVERSE[input.charCodeAt(pos++)] + 2;
        while (runLength--)
          single[slot++] = ++previous;
      } else {
        const next = BASE91_INVERSE[input.charCodeAt(pos++)];
        previous += 89 + // eslint-disable-next-line unicorn/prefer-minimal-ternary -- branches read a different number of side-effecting input bytes
        (next < 90 ? next * base + BASE91_INVERSE[input.charCodeAt(pos++)] : BASE91_INVERSE[input.charCodeAt(pos++)] * 8281 + BASE91_INVERSE[input.charCodeAt(pos++)] * base + BASE91_INVERSE[input.charCodeAt(pos++)]);
        single[slot++] = previous;
      }
    }
  }
  decodeDelta(dict1AtomCount, 0);
  decodeDelta(dict2AtomCount, dictSize);
  const references = new Int32Array(ngramCount * 2);
  let poolSize = 0;
  let ngramIndex = 0;
  function readNgramReferences(count, startSlot) {
    for (let index = 0; index < count; index++) {
      const slot = startSlot + index;
      const a = readSlotCode();
      const b = readSlotCode();
      references[ngramIndex * 2] = a;
      references[ngramIndex * 2 + 1] = b;
      ngramIndex += 1;
      start[slot] = poolSize;
      const entryLength = (single[a] < 0 ? length[a] : 1) + (single[b] < 0 ? length[b] : 1);
      length[slot] = entryLength;
      poolSize += entryLength;
    }
  }
  readNgramReferences(ngramCount - dictSize + dict1AtomCount, dictSize + dict2AtomCount);
  readNgramReferences(dictSize - dict1AtomCount, dict1AtomCount);
  const pool = new Uint16Array(poolSize);
  let write = 0;
  for (let index = 0; index < ngramIndex; index++) {
    for (let half = 0; half < 2; half++) {
      const source = references[index * 2 + half];
      const value = single[source];
      if (value < 0) {
        let read = start[source];
        const readEnd = read + length[source];
        while (read < readEnd)
          pool[write++] = pool[read++];
      } else {
        pool[write++] = value;
      }
    }
  }
  const out = new Uint16Array(resultLength);
  let outIndex = 0;
  while (pos < inputLength) {
    let slot = BASE91_INVERSE[input.charCodeAt(pos++)];
    if (slot >= dictSize) {
      slot = slot * base - twoCharBias + BASE91_INVERSE[input.charCodeAt(pos++)];
    }
    const value = single[slot];
    if (value < 0) {
      let read = start[slot];
      const readEnd = read + length[slot];
      while (read < readEnd)
        out[outIndex++] = pool[read++];
    } else {
      out[outIndex++] = value;
    }
  }
  return out;
}

// node_modules/markdown-it/node_modules/entities/dist/generated/decode-data-html.js
var htmlDecodeTree = /* @__PURE__ */ decodeTrieDict("!}.&u%}'&}*'~!6*)%&,~!J~!J~%L~y<~!R,~~%Lu~~#GD~~#|)1#%}^%}2%+#.##%##%}&%##%'#%##&%#%#'%#&#%#&#'#%%#&#%##%#)%''%&%#%#'%#%%#%%}%%%#%#&(23#%%#&-%0%('1#(##%#'##+%'*.:1}#%#6-+(%'%%#%%%}#L'2351&('%}&/N'(0(/*-%(%%}#'+&T%7.2}#&%&#%#36/5##%&%%#&#%%#))2%%##%&&'0~!#*+&'%1~!%).'3q?&%'1~!.##%6(~!+%%%(Gw'rT~!E#<nA%#jZ~!H%(~!42##~!*31&~!G%U~#)5~#`3~!J~!Z~%]~%Y~%C~!q~!u~#kz~%#~!6'~!D~!U~!?~#T~!c%~!G#'~%7|~!G~!J~!G&~#pb~(Df}#%}*&}#%##%##%##&#-}&'#'&%#.++}%mI,#,@&(}*%}*'%&##&#%##%}&0}#.},U},%}+%}&%}#%##&}B%(}(%}+%)})%##%#&}&%##%&}<%}>%#%&}*%}(%}9%}/%})%}*%}*%}?&}&%}3%}&*#%})%#%#)}#&#-#+*%E%%'%'#%}#*V##&##I}#&&##%&%#&&Qf%%))w/0+&%#(#.%-''''++++7}>%4'',##1,#%#&%##&#'##&#*#9)%&%}#*}%,#+P(%A&%#'&##wSD',9E00#y#@}(+}&%&>~!#~!X}#*}(&&}(&}(,%}%&#+&}#&}I%#%}%)#(},'%#*}4%%#%}(''}#/##(##),%-##%%)#&}(.}&%#&}%%}*&#%},&&}&%}#%*'#%})%}D&}&%}-&}6&#&}-,%}#%})-(~+`~,=?~I9'9%~!,#%})%})%}@%}?%}(~!?~#<~#pP~#BG~#=1#%K+~#?#~%;)~#A~#mF1~#A'~'X%'~#lR~#N~'N~#r~#m#-~#i'?%#'%~#B%##%,%#~#_%#0%~#]732~,w~2+#:&#%&'0%&>%}#>##F+)#%&&#(+_}4&}-%}(&}@&}O7Fdf0@+/v4}&WU##&/0#&'('B#%}.%}'+#%}#%%&#&%#%##+#&#)#6#'#.},%}c%},%#%##%&#&%#&~#>'*-.%##%##%}#%%}%'~#)D1}#%*&~#_%%'(~#S2%'.}#~#=##*'*-%}&'%'##&&~'E%.#&~#M4}%%##&'%#~#O1##%&#'+~#<B%##%%'%+~#;#@%}#&%#&&%#(~#H1}'%'##&&~#?A}&'~#D#%32}'&&&&~#[}'(#%}'~#;C})&}%%#%~#=&%,3}%'(#%%~#^'#&&)#%'~#Y%-~#d-%'~#^%%&#&&&}#~#b~2t*&'~&(~&@~0%~e~3}%*''0})&}+~!9##-}#%-hD*)1fC#%/&/fB#40~!+#)*4~!+~!K'&:~!/*7~!.#~!H~!L':~%x&~!H#~!*~%1~!I#~!+A~#p'~!F~~#-#~,,(~.Z~!V~%;'B'mq-W~!N~%I%#&&#&}#%},%%}'%}+X#%}#&}(%}'%}<%}#%}%%'}'%}:~![)9@~%>~#UA%-%##&~!C%~!-.9:~!1~!-^2/:a~!y,D*J#-5)/4~%23,~#G~!L1~!0X3`~!2+~!!0-~&E~!W~!o,>Y&]~%cZx_&~#O*9#A#'#+I'%#)~!0B*-5A+-((F&*M#)(-7-5+'-3a5Vi~!Y~!?+[)%3),ERHm~!+:D,VG.+)?fB%%*(%)'(#&80%1'8`K8?`+'Z#&O&'H5#*9)A%%5&3))0%39+.*7#()&&*=4@**L)<'_&*+..;(#*+)./&0#3)%')-8(4ixD(&.}%,('aI:,)%,k2231T)I'#/-W7,/'Q#.'Y24+h')37</31&83##&0#),H(?'&?/1##%#&&#%''-%&&&#(&''&#.-'%#%%(,')*'&#&#'##%(%(#%('#&##%%%%('%#%#%%#%#&%##h>w+v<ayvyvcg.uuhKr}g/v|g>u9i[~>g5uI~=RvdwEg;v/g;uk!!TTSx]@RT!U!#!@VBRUU!'UTe-d0c`e&gSdicedFcrdTaqb.kYcAohdYd@a3e+d}dMdtd.aJ#bqcK`dle/e.e'dwdPdodddjbEb}ogd^ofdpduc6j?l%d{drdqc)d7bacOdQ%T#Y)X.sR[yH>6Vyv3[xwLu>vo'!*.[yBacahoj>6Rew3[xqdZa#!a&#^(X-[yG>6Vyu3[xvg3sEr|g.u/Ri9db0T#^(Xa)!-[y;>6Vylg4wKs{JwNZt3@3r=c4Z([xlg;wKt!cpq's@v7A'*a(a+!-a#[y<3Dt?3Dt'>6Vym3[xmg9rxsNJwLZt4~?r?db1T#`-!(Xa,!0[yS>6Vz%NuQs.g4wKtnJwNZtS@3r>c4Z([y%g;wKtrdga8!a(!#&T*Y-Xa#!a0<or[yc3Dtq>6Vz43[y3JwNZtf@3s!Ju}!%Dti:pm3c_%X#tjB5pkd6q!r]u?voC'*-a.a2!0a&a+[yI3DtI3Ds~3DtH>6Vyw3[xx;:s#~<5pKJwNZtE@3r~d`a)!a2T#a.(!+U.X1[yT3Dt`3Dtv>6Vz&3[y&g9rxwzcxstPu.<rAJwLZtT~?r@dZa%!a.&^*Za(/Reu[ya>6Vz23[y1g3sEr}wkg{NuQRg{ci(U#5@b`~,cg#U(2WnH5wugcRh7dX#T(Y,a'Ta!!a,[yZ<]mj>6Vz,3[y+Pv#5ReZKu+=,%!H}7ABwkaS?Rh:BcW(X#<]mrj:ubv/ARekdg%!(!a.*Ta(Y.X1!#sP>Rl*Dt6[y>>6Vyo3Wf*jOvuumvuRgRJuq*!:9<B@bX~3jVv&v@s@5Re[d/rQt{uAvo&a&a*)a2!,0Wf!3Dt0=Bs'>6Re}3[xy~<5s%JwJZt1~Gs)c;&!#2sJkNuXvzq7rxu,Re8dka4!a8(aEZ+a@Y.X1Xa)[yd=Bs(3DtP>6Vz53[y4cX#X&Re:avRe9~<5s&JwJZtQ~Gs*i^rzvdRg+Jv{%!2sbB@bX}kdga,!Za?&^*T1/!a'Dt+[y6>6Vyf3Wf%g/u;s4hGu6?Rh-JvZ,!c%#&RoX54Rivj7uyvf8RgTKvZB%*!2sGh<vu5Rgq<=C::9bb~#dZ#T&Ta6Y.X*Dt>[y93Wf)coZ(T,6VyifluvRgC@95@B@bX~/hFu34cC#T,k/unq8w8Q5RkUklwQuzunq8w8Q5Rk8d/rJu?v8w9)-&!a0a;a&aIWejg3sEr/h1s<DtDJvyZqY5aws3Jvy!&Wei~Hr1:au5@Bag>23E~5c:Z&bX};kKv?w&unuVu5Rjc;>bs)#~@:Rh.=ay<a]C;b`}Vd6s/t{uAvoaxa()!a,a7%-a#a2Dt,[yF2Wo[>6Vyt3[xuNuPRi&NuPwpi#RoWh?vf8Ri%Jv]!%Ri:KvxD!.'2WeAjZu`q9rxu,Re7woeAg-unLq(qA_/*2Wg_g3u5q^9:4E}/jTrxrzv=Wkkd~0UX#^^Xa-a1a5T&a=U1a'*aEa]!a*aPaA-adok[y54Rn>;:p3~Dp5g9rpsFNvZqjg3uJp4~<5p0Pw;5qlJwNZt*@3p1Pw:5p/Ou!5p2JvG'!6Vye=<qnJvh_[xhg3v,Rh3kOwOw-sDuev/Re^dha[a%!%!a+#Ta7)-5TaCaO!aka!a)sf[yb2>Rl!9ARiq5E}Qg=ucRkBE|oJrJ_@Wk~@Wk{JrJ_@Wk|@WkyJrJ_@Wk}@WkzJvO_[y2g-vMRmiKuYC!)&>Ri;>Ri<@3RkNc](X#@9Rk=g5vuRmhKvDB!+'=]meg3u4Rmgd)#Y'Vz3CARmfd`a+!%T'!+#Ta1Ta6TaM-sTDt9[yA9sYd'%Y#s[[xpj:ueunaXRgEjRq,v-vuqdd2'`#6Rev<32@5>:2<E}5xIo9a*X#Y(;5RePJvD_g>vyRgNj8w)v8<wggs:RgXiZt|vjx,hSq3ah!-(~@:Ro/Ou!5RhWj^v(pyw8unRhUdx-UY#^Ua.a3a70!)%UX1TaDa)'omRiRRhE[y:3Dsz=Br,>6Vyj3[xkg6ruwjcqsrPw;5r*Ku]D'Zt-@3r(~?r.i[vwv]dU1a--U#`a4(g/vsRhPOu!5RhLj:rmu9Wo!~@:wdh@g/vsRiTjXuvvNr}:RhBj^v(pyw8unRn]dz1UYa'a+^Y(!aETZalaRY.Ta?a4[yDJw1!#qLsW>6Vyrfzq-pLflpwRe|Js>%!Dt@3Dt&Jvy_[xs~HrnjMuwpsw'RecKu+D#'!t<~Grl~?rjg5u-x,gwp{ah!-(~@:Rg~Ou!5Rh'jXuvvNr}:Rh#cW#X/c;&!#2sLi[v7u7RgpJv)(!iLrxu,Re6j7v@s@5Se[e7d`aW!Za(a`T.a#!a3!&aDa-!9)Dt_=6s+3[x~~DR|h~DS6avhGun5RkZj3w)v-]mkKunB!&*]kb97R|i<ARk<c:Z(6Vy}Juh'!wziMRoS:F|vkLuauJv5vtvQRh1d='T+Y#VyO~DR|jcF#T'7R|g97R|kJv3'!ay<Rj,Jvh&!:ReXcsa6*a+#a#_aIRf9aLRf?c,Z&Rf5Rf7c.Z&Rf;Rf>cQ#%T'p-Rf8Rf=ct#%'(*!,p,Rf4p+Rf6Rf:Rf<d~'Ua%U*^UYa(!a,-!#a4YaTalaEX0a8a<Weo3Dt/3Dsx=Br93Wen~Dr;~<5p<JwNZt2@3p=Pw:5p;Ou!5r3c7&!#:p>3Ds}KvGB)_6Vyk2sM=<r7x'eovA(!hFu1ARf}cV#X&@r5j6rvwQa^Rf3c=Za'wkghJv__g;unRggA53B9=b^}%j6uduo5Jq;!(hIv%2Re`Ou4ARe_e%a#^^^Xa&!a*a2!&a6YaP!*ad!#a:aE/5Rn?[y@>6Vyp;:pE~DrY~<5pBJwNZt8@3pCh=rt3rWPw:5pAJup_[xoNuPpF9c!#'45pD5ARn)d8#X'X*3@rU72s]h>v<<sSjJpqvewOJq/(!hNw'5ReBk0s2u3w/w'5ReE5@Jq.!a+JQ!&WeU23d(#Y&RjG5]jBk!u7w&u0udARjEe#+^^^Ub#!a2/a`Z(agT1!a-a;|@TaG!aS[yV=Re~fow'RguNuPRe?bz#'>RoUWeL>:Cbb|?JwPZtVg6ruRmzJvD'!6Vz(g/vmRh~Jvy_[y(g9voRgyx*cy(#2>Ri2B9b]~9kIw9u7rluJu3Rg]dI#a%UY'@=p%CAx.gQZ&RhwwygtRm{x5g_Z'+ABqR9Woa=Bp&dV#^*Xa'!&@o{g4v]Rk;Jv{!%Rk[wkkiA5RkiwwfUB=x,fUuqC&*!>RfTg8v0RfV~ARfSd;rJsAuAv9wR'ae+/aO!a@aza/a#[yQ@Wg!2Wemg3sEr0JvB_g>uvReWg2v+Re=KupB_+[y!2AbY~-~Hr2AJwD!(h<~El>h<~El?Kun@+_:9b`}Kg-v/Ri3g;vtwyk_9]k_d=&T#*U.6qh@Ab`|K9:H|CJv[!&3Dtex'fDwC%!Rf[9WlMd[(^X,!a%Z06Vz!@WgBg=v~Rgvg,QRe@awd,#Y+jTv|Q~EfWj]uNr|~FRfXdy#Y&^Ua%!aO.!(a)Ua;=!a@aKap!a-,a!Ta]a[rSa]p?[y82sK=Bq~;:p:~<5p8Pw:5p7d'#Y'Wf(;RnRi[u4w&RgJJvG'!6Vyh=<r#ijuuv/sIKuYD'ZtG@3p9~Gr&d2#`(g<vtRgFj`u5w&rqpxRf2CJuY!+:wfnTOu!5Rg}jNs1ucv&RfwJvA!&3@q|BDcC#T,k/unq8w8Q5RkTklwQuzunq8w8Q5Rk9dga#!a'!a=#a0!:+Tb*b@aO.a4!aba8aFJv^}?!VyR~Dr<g;u%Rn.~<5p[x'e`wNZtR@3p]Pw:5pZhNvjBp.woe_g5u-r4JwF!%DtO3:ooc7&!#:p^3DtpLuGw(!+%)Dtk6Vz#2sd=<r8d'#Y([y#<x3gJt`w@!)%}MRiowzikRij=]ilxAf3,U(#B2Rf#g0v-Rm[ck{`U#]giKv3>)!&6Ri154s,KuGB_%@r68r:dJ|t`#X(9<E|u2@H|rx3gJu?w'!+'1Nu7Reg4=H~+9<wxgY95Rm]xLggZ-`(X}U2:Ri4h<uOawRmsJv__5@bb{jbV~3dka#a'a]!,#a+U=a>b6a3b%!/aKa/)!arwve^VyJ;:pR~DpTg3uJpS~<5pOPw;5qmPw:5pNOu!5pQJvG'!6Vyx=<qoJvA!{~Jup!%@qk7Rn/KvyD!}''[xz;>wkh'?Rh,x8gyt`w5D!&),(SgyccRgztJ@3pPB5p#d'(Y#<]mmifubw&RgoJvE&!82s^JvF&!8Rf,ADb]~;x=h'rNu]vK!,%'*0RnORh)4Rh*AqQg-vaRnNg;wHwkh'ba~4cE#Ta*x3gctyw@'!+%RnFRnD<4Rn@hFvK5RnCxWg[#`&a0Ua()`1Rm75Rg[c]%X#qi8Rg^NvdRj>BwzgZauwji7Rm6A4wgg]d1#&(*,.0a#Rm;Rm<Rm=Rm>Rm?Rm@RmARmBe%#^^^Xaea?aC/b+(,!a+a#!a/!>a&Ta<aKbD!2wphBRnk[yPw}hE|.=Br-3Dtm>6Vy~g6urRf.x,hPrNav!%'RnqRo%Ro#Nu;q[Pw;5r+JwNZtM@3r)d'#Y'Weh;xChL#`&RnmRnoKu}>%(!Rne~Bs-;2wjcussJv+'!aYSO}6@B<5?ba~8LrNvj!.%*ROwungw~ng~:9;Ri^>wtnig;wHRnixDh@|(UZ.x1h@|)!#:2<H|*xHn]#-UX'3Ro)z=iT}6ARns=Bwsn_wpnaRncw]aR(#UXa&Ua*a/=]iPd'#Y&Ro'WnXf{QRm2hNvj]nZd`'T~&1`{|`#9b]{}c:'!#Wl{>@=be}]?cl{{U#:5Abb}Jds#^YaF!a*b4a#a3aPa>&Tb!bH!*a_!Eau?/a&RjY<]gj>6Vz*;:pe~DrZg,QRj1JwNZtX@wihspcJvZ&!VyX9WmOJu|!|N2WmHJvh&!]ht~Bpbcn&T(!#RmQ<s7Nu;padH#X'`+WmJ@>RmKCARhnKup=!)&Wf+:RhqNuPpf9c!#'45pd5AwghpARn(Ls@w!%,)!RmP@Wfe<E|IJva!&WmNg8vsRmLd`*.`#Y'Xa!axRn*]hrA8Rhug5s@rXg8u!RmMd8#X'X*3@rV72smdI*#UY&RmICARho~GsgxVgd)Ta'U-Y&Xa!T#RnEWnA@Wffg1uDRi0hFvK5RnBxGnG&#`%owp)@wsf+bX}Ze-*1!a*^^^Ua|!#a.aq&Ya2!a>.a6!a:aO`aJDtL[y`@Wg#>6Vz12@wzoYRoZNuPRi!NuPRhzg=ucRi,@=b`{Yg=ucRi-ACJvB!&Sh[ebSh]ebi`wUuFRm4Jw2_[y0JvB!.<Ju(!&SoG}6Shd}6<Ju(!&SoH}6She}6Kur@._g5vHRieJvx!{L2G{Kx6gd'T#?Rh82Wi5cZ#X(g1w)Rm5dW-Y(Ta#!a)!#aYa=wnfE=su2>>bU{0j9udv:<svj8uQv-7RgHdE%#^'sq9sp=>Bb_{TJv`!&g/r|snj6v(us5d,#Y(56H}[978H}]Jw5!&g1rushJvB!+j;v{u5?zDhd}6}bj;v{u5?zDhe}6}ce*#`(^^^a[aea!=!a6a*aoXb1a.!aAbL!b>,b'aL!aV@Wf|2Wlg3[y/JwNZt^@3piPw:5pgJunZou3@rsJva&!Vy_g<v~Rm#JvG'!6Vz0=<r{Ju{%!:pj@WfsiXuJu3Rm:JvZ&!WfA~Bph@c4Z&Dtwax5rubx(#:awRk1@d,#Y&RfjRfid1#,Y(@Wfp2Wlrg5s@ryKu[@!,'=]ig9wlk?Rk>g5u-rqJvy'!@9RkQcH(T#=>Ri~@<wkj(Wj(KuZB*!&<7rw@9RkRcH(T#=>Ri}@<wkj)Wj)dg(Ta2Xa9X#`-!a*CARhg@@=I}d9x;c~#X%so=<sj>2@@=aybb}XjWv0Q~EfEj3vLv;<d,#Y(56H}`978H}_dgaPaFa'a/!#a3Y0a_a;a|!1(a7-[yE3[xt;:pJNvZrrg3uJrvJwNZt=@3pIh=rt3rxPw:5pGOu!5rpJvG'!6Vys=<rz@c4Z&Dt(ax5rtJvZ!&~BpH@wsfNg-vaRlNci*U#=<wei<F}a5@Jq.!a*JQ!%@qZ23d(#Y&RjH5]jCk!u7w&u0udARjFd/prq=tyvpaEa(a:.!a1aZ(@@=I}:9wpd%=<sX55w_h}@@=I{t=ay<aU@@=I}T=ay<2@@=I})?C9:9au@9Cb]}DP~=x-fAZ(2Wl1=ay<aU@@=I}>5@d##Y+jTv|vV~EfFj]uNpn~FRfGdgaK!Z2&!a8a-Tb({E!acTbM*!a(DtY[yYd'%Y#sl[y*hHvh>Re5x2c{Z}.j4uCvcawRiMd+#X+_x&d!},<5RkX;2Hzw@x,gavfB-!{CcF&T#Roe;RodwWbBg5urRgaKvHC*_6Vz+<4opieuew&Rmq@d]&Y)X,T#X0Rh}<BqP=4qS9:ReMg/ujReNJw0!/<Jui%!bd{kawwnemRelAxUa?a3#*.&UX(Ya+a/RhvRnQ<o}9Wmtd-#Y&RgSRmw9;Rmxay=Rmyg-vaRmuxEhSrNu,v-voC!%(aR.a(a7+1Ro1>Ro5CE{A9b]{@;5x#eO{:g;urRi+KrNA!%(Ro3>Ro79;Ri_Ku@>{;&!x%gX|{KunA_+g5QRj/g3u5Rj#g>uERj%wio/xRhS&!,!#^1U}wba{8>>@=be}qC@:D5ba{7Ku+A&!}x?ba}t>>@=be}se(aA^^^Uat!b0#{pa+awUazbGa#aLb9bgaWac'a5TbS=Br!d1#`%scp_Jvl!#rT>Re0JvX&!VyN=H{Fcm#U&:pY=ReaJv2&!]h0=]nUJvG'!6Vy|=<r%JrM_=]h2@Wlud'#)U'Wf'b]{i=]h/Jvh!&~BpWg=v]RnMx+ny#'Nu;pVwjnu=]nwxJnx,T#`&Reqwjnt=]nvieu9vrRjLLuYwP(#+!th@wih5pX~Gr'g5v/Rh4KunA'!-CARnP@wwiN:Rm_9x'cvw>!|l=<saKvAA!0&3@q}>w^e1bp#&Re2Re3BDx7gH#T|f5H|eKuZ>!%(:qNAH{]Jv6!+3B2B9=b^{X<5<B92:E{ZLvhwA(a;a%!igQuyRmad+#Y}m@3Rh5d8#X'X*:AqUAHzmaxwbh<aXRnVcF}RT#Nw&cj#U(BWnug/vsRntdka)(a3+.Zb7aYYan1!bVa@Xa}[y^@b[{G=H{+hFu73Rj&Pv#5ReQcK%T#sig1v{Rj'Ku+D#'!t]~Grm~?rkKuMB!01d5#`'Vy.ta3Dtu~Hroc8#'{^45s85AwZbP&!#Rn!wghxWn#KvEA!)&2RlA2RlBx:h|#(T,=]j09Wobz>x]z/@awRoTd+#Y(az]hFhCrm4d,#Y+jTv|Q~EfMj]uNr|~FRfOdCa!Xa9_X#@<plJvf!%b`{(9;Rgwc;.!#2x7cw#T|UDb]|T5Ju={(!=@E{&Jv)&!Ab`{'awJvf!~*>>@=be{#KuY>!+&4Ezyi[ugv&RjIdea+T)#UXa&T-T&a!Rh9auRmW=]kLg5vuRn+g3u4Rn-Ow6ARn,hHus5xNk?#UX(U~)/g8v0RkD~AwkkF?Ri.OuNBwkkA?Ri/d|a2`a*^UYa.!aBTZaTa'Xa;!(!2!-a#b2[yC>6Vyq3[xr2Wi?g1rusVh%s?DtF~<5rbJs;%!DtBfswKtCj[uvuSsEu3RgVx3o:u+wN'*Zt;@3rd~Grh~?rfg8w)Lq)qE&-a%!>bI|`jWv0vV~EfCjTv|vV~Ef@j]uNpn~FRfBcK#T']gWNu7x,k7q4ai(0!hHv8<RhmkMu9vrsBuev/RhlCJvB!,g<v{wchh~@:Rhji[vrv{wchi~@:RhkdS&a5UY#Ta!RgPwwiI5BwciI~@:Rh`x'iJvj'!5]iJPu8Bwch]~@:Rhach)U#h3rp]gLh@t|Ax,hTq3ah!-(~@:Ro0Ou!5RhXj^v(pyw8unRhVd|)`,^UYas!a?/a2Z'a^Ta{Tb7Ta(a#!a,Wf&9sZ3DtAadamov=Bqt3[xig8vsRm~>waiL2b`{QJv*_Ouv2qgj<v]v2BqfdR'X*X#Y-@3qr~Gqv~?p6hHv-]glPup5Lq+q?_%*b_{qF{n9b^{rOu4ARhpKvCD!+&~Bqp:5Dbb}nwoiKl&unuTuBv]v+ueunaXRf0=Jvh!0nKufu8v1w&w7q%w&uHrz:Rgnj5w,uxDJq/(!hNw'5ReCk0s2u3w/w'5ReFd>Za&!*UaA=<wkgsRnSJv^!%Refifw3vyRgOKu_B'!,<]gkiiu:w&Rh<=C@a^<B57@2F{[<B5@aW:=3away9A5aW=<B=C@a^<B57@2F{Ie-#`(^^^bCara.b8aza6!/bZ,!adTbnTbOb+aFaS!aAT9@Wf~2Wli3Dtl2@d,#Y&RfnRfmJwJZtN~GqyJva&!VyMg<v~Rm%iXuJu3Rm9Jv[_=]ih9wlkDRkCd1#`(@Wg>2Wls3cH#T(@<Rj*=>Ri|b~'#23s9h<~El.d'#Y&Dtxi^rzvdRl#d*#U%(o|B2s`hJwSaxRmDKv4B&!1:Rmdd5#`'Vx}to~Hq{x'f1v3(!BA5ba|bJv_&!Wfug1v]ReIdO+U/Y#&G}-8wze=Rh{g1v]ReHg/uQRf/by#)ibQwERl/cH#T(@<Rj+=>Ri{cNu+vlax-!(#a0qa9<Rii2;;bU{H;x<i=&X#Rk`<4wwi=C9H~8xAI(Y#<azRi@45wXI<B9;5bb~7dL(X#Xa(+!aL6Vy{g5QqOau:5au2@ay547EzbxOcU(UX-T#Ta#:Cbb|A?wjh/b_|SOw6ARgtihr}u7Rhy<d1#T)X1@@=I|~=ay<2@@=aybb}Sj3vLv;<d,#Y(56H}A978H}@dGpvs@uAu`vcw9*!aFa+ai%(b!aXa8.a?a[ozWey=sU2@G}Nch&U#Rf_WexKu+D#'!t:~Gr`~?r^j]uNr|~FRg*j^psurwJt|RmcKv)@&!)7Rkv~Br[@wxfO:Rl3co#U'6Rezj_q#vIuavjRltwzeyh@vr5JqD0!>aY?C9:9au@9Cb]}9cl#U*5;5<H||jbuus1ucv&Rfvg1v~d/pppzqFr^a--a~!aMat1(hFv;Wiz@@=Izoj5uuv-7Rix~Cw`fk2WlVcZ#X,k)u3vWs@u2]ktg;wEx'fBq(_2Wg/jTv|vV~EfoJv]!15x'hzqG!(P~EfU~CRl_j6v(us5x4i-#T(2WmZ?C2F|d>Kq<aj1!*jTqIsBv=Wl`~Cw`fi2WlWj`v0u*~>RlR=c>Z,k#u3vWs@u2]kr<c1Z+jTqIsBv=Wla~Cw`fm2WlXdmb3!a{(arZa`bkTa%TbQTa-a9+c'!aM!/[yL=Bqug.w'RifhFvyDRj.g>vgwyk^9]k^Jv3_@WfbAARkhJw2_[x|JvB_wkoIRoKwkoJRoLd'(Y#<]gm=<9<H|yd'%_X#skDtb3awwqkgNulRkgdB#^',9:p'hJwSaxRmEBwVb8@4=H|qLu+w50&!)@3qs~?pU>Awwn;;Rn=c:Z'ARn<=<qwKvC@!/&~BqqJv6!&]eVb^z^xRge'/a%+^`#Sge}6<4Rn3=]n0Pw2>Rn8Jw0!&>Rn:>Rn6cY#a7+!a&=<wkaNw~h3z_c5Z{=wjh#=]nLKv^D!&)Vyz=bW|swYb<WetcG#T(2wxa@qVx@gD#Y&b^|V5JwG&!5bb|pg/w&RgD@x=kHs=uAvn!a%%/'+RmSRh694Ro`g-vaRmRhHv-]mlxCcS#`&ba~.5cD#Ta)P~=d,#Y(56H{>978H{Dd_#{2^Y%_+qbbb{6g3sERhsbU{?dfa.,`a(Xa<!aiX#(55RiG54RiHcI#T'WiU3RiVNvdwtfcRlKNvdd,#Y&RlHRlExQgf.1*^T'X#Sgf}6Wn4=]hfPrk>Rn7Jw0!&>Rn5>Rn9Lunw?&a2!,5<oq@@wqfdRlJj5Q~=d,#Y(~ARfcOuN]fdDKw;ay(}i!547E}j?cI#T(@5bV}iCbV}hdv(^^Tb?a40,b##Tbo!a*bR!a<b|a/!aKai!aU[yK=]o^g:v>ReGJwPZtK<7Rh+h<~El,Pv#5ReR@awwxjCg,ulRjDJv6&!]j!z?aQeeg>w=Sh<eeJw;!&axEzOg,Qosc!#*:wkeJ]eJ>x'h-u(!%Ro.w~h.zPdNZ(X,Ya![x{;9ReY;wkgxRiF:x?ap#Y&RmUg<s2Rkod]+UY0TZ'!a&A9sw<=bczLNvuw{gqzNhJwSaxRmCKuLay!#&s_Rf-55b^{uJvZa!!c%#(55Ri654wmiu5RiuawLu,vp!+}^%b_}Y9;wkgxba}o>A9:=b^}zKuh=a''!3awRk3c*'!#aHRk6c+Z&Rk5Rk4Jv)&!awRjSawd9*`#0?C2@EzMj8u<uJ5RmbjQrquJu3x,k>uq@_+=ayb^|W~ARkEOuN]k@7dhzV^X/X&a-#zRzSb`zXcJzTT#2WkVKvDBzW!%FzY9;5bbzWjQrquJu3Jw3%!b`zU=ayb^zQd:#X(T-a!6Vyywxh}=b]{Jg=u1RiAdGp~qHtzv!w(wA+a+a;<!aJaYai'anasb(=azRmV:Cbb{MLq2vb!%')RjuRjrRjtRjqx3jnqCw3!%')Rk(Rk+Rk&Rk)Lq2vb!%')Rj{RjxRjzRjwLq2vb!%')RjsRjpRjfRjex3jcqCw3!%')Rk'Rk*RjkRjl9<CbbzfOu4ARhxLq2vb!%')RjyRjvRjhRjgx=joq*uKvb!%')+-Rk.Rk%Rj~Rk-Rk#Rj}x=jdq*uKvb!%')+-Rk,Rk!Rj|RjmRjjRjidAq&qKs@uAv8Aa.'*-a@a&0!aM@a5[y73Dsy3Ds|3Dt):wxgI2sHJwJZt.~Gqxwsf0ikrzt}Rl0Jvy_[xj~HqzKv_A|D!&WfP8axRoVcf,U#k(v]v+ueunaXRf1Ju}'!g8u#Ri=jQw!sCunLprq>!,')~<5qeGzq9F{W=c##%s5au:5aU3CBE|;d4#X(D!a&6Vygx(b;#(=]ed?C2F{N<capoq2r[a&!aPa9,'Pw;5s:@@=I|,55w_h|@@=IzcP~=x'fCqB_2Wl2>aU@@=I|1OuNBc1Z+jTqIsBv=Wlc~Cw`fl2WlZ~AcTa%!Z+jTqIsBv=Wlb~Cw`fh2WlYk+uNqJsBv=WlSg,u3dca3#UXaMYa)TaB-=cM|7T#<bI}l5@B932:aV2G{BOuNBJq:|M!5Ezt=<B=C@a^<B57@2F{v>cB{/T#=ay<bI{3Jv6!a.6BKq0ah&+!5E}HP~Ef{978BaU@@=Iza<7d#.Y#978BaU@@=IzH~AJq0!(@@=IzG978BaU@@=IzFe,aU*Y&^^^bvJb,b:bFad!a,c2Ta>aL.bo6!a#CbTa'T#Re{2Wlh2@G{yg6t~Ro_NvdRfticuRQRllJv3&!x&c|zs@Jw3!%RflwpfkRlpKuL;%(!Re<@G|C2GzdhIvuBwgjAg-u0RjAKQB%!(GzZ@G|5NuuRl7d='T+Y#Vy[g<v~Rm!==G|>JvA!)@wma=]m1ifuaw&RmnLs@vT'!|/+[y,g:v>ReTJw1!#qX=x!eC{bLu+wT&)ZtZauq_~Graci&U#F|89:r_Lupvq!.)&2RlG8RfaC=x!eF{_h?rpWlmd&'!#X|&]k::xJey#`'T|+<E|&2@H|%dE#(^,g;u.RiEg6vjRiC9xCkA{O|zY#g=ucRmXKs0@!&*@G|m@awRknJuh!,3d(}gY}eJvj!%Rm):Jw3!%Rm+Rm-Ls0w(&!a(a#@b[|6cZ#X'7RkxWgAOu4ARn'dH'U#Y*Vz-Wm'CARm}d]*#a%^a*T'aK!a<9bV{PC=p*Jw4!&SgxcbB5r]idw(wBRmF7xFkt#&`(Rm/Rm8E|!JuY_9:Rl5=wrgr2:bbxd@xXfB(a*#T+!.X0X1Ta/a'T&RlDRfL>RlyARl9b[z[>RfZ:RlL:RfRwlg/ARl;9;RlxKv,A/!%7s69<74=BA5ba{-8Bde#`a<XaKYa1,a'P~=wxfB2bZ}}?C972@@=I}r8@55B9;5bb}G978B2@@=aybb}3j3vLv;<Jw3&!>Rfk=ayb^}4~Ad1#`*@@=aybb{w2@>==<bbz]dx+UY#^UaF!a9!bB'Ya1.!ajXa#%olRhD[y=3Dt#Ov5BrHKuMB%!(Rf^Wep~HrJwkiQjKr|~FRg)Ku+D#'!t5~GrF~?rDdV)UY,Z/_7RkuG{<~BrBg,rlsO:235B@bX}|d?a1!#`(6Vyn5@d##Y+jTv|vV~EfIj]uNpn~FRfH7Lq2vb1!a9-978BaU@@=Iz9978BbU}#~AJq0!(@@=Iz8978BaU@@=Iz7~AJQ|}!978BbU}!JvkaK!AdUa21-U#`a+(g/vsRn~Ou!5RPj:rmu9WhOjXuvvNr}:RhAj^v(pyw8unRn[kPr}p|u7vwv]RiSBd;pppzq@qHQa?(b.!a.a`@.|xa(hFv;Wiyj5uuv-7Riw~Cw`fg2WlU978BbU|wOuNBJqG!(P~EfD~CRlQcZ#X,k)u3vWs@u2]ksg;wEx'f@q1_2Wg.j]uNpn~FRfqJv]!15x'h{qG!(@@=IzK~CRl^j6v(us5x4i,#T(2WmY?C2F{1>Kq<aj1!*jTqIsBv=Wld~Cw`fj2Wl[j`v0u*~>RlT=c>Z,k#u3vWs@u2]kq<c1Z+jTqIsBv=Wle~Cw`fn2Wl]dn1#c(a(b^a2!b/bAT(bj!aDa7bu,a_a{c0!2T0g:v>ReD2@G{42@G{5~DpM~<5rc=Bx6i>{RT#RnI@zCx]y]z:2Jv[!zr5Awyk]9]k]dD(Y+X#6Vz.g=wKtgwhaCwgmTWj2Lu,w%_+/[y-B;b^xeg3u3Rj-2@bX{*KrJ<!+'@Wg(g?QRlC@Jv`!%b[zIwsfII}8JQ_@w|kW|=Jv(%!AqcOuNBJvEzh!bYzjLs@wP#(0!oy@>RkdJwMZtc3Dtd@BcG#T'9bWxg2@2Fznd*#Y+;2x'c}w<zizixNgwa#Z'U+!/!a'!a+w~g~z6wcn{Rn}wcnzRn|5Rh%=]nJg5vuRmvNvdRlvcprJu}w*az*a#!%.a.'Bot9qT]kj@Wg'ay2Gzv@Jv`!%b[zEwsfHI}1;ck#Ux`<Cbbx_Lu+w!a&0*!wko*wwo,So,}6Juqxf!E}PigQuyRm`d3(`#8>Rn%:A5B;bZ~%KvhCa!a2!x>k7#Uxb@b{#xaRk7Jw0!)>wwhlShl}6>wwhmShm}6CJvB!.x'hhvj{!!5Bwkhhbaz}x'hivjz~!5Bwkhibaz|xEhTrNu,v-vpD!a%&/)a3a.,%Ro2t[CE{)@3re9b]{%wjo09:rgc:Z&Ro6=<riifuaw&RmoKrNA!%(Ro4>Ro89;Ri`dSaL'UYzxZb)7Rka3xRhT&!,!#^1U}vbaz{>>@=be}yC@:D5bazzKu+A&!}{?ba}y>>@=be}wxBh[t`u~vJvr!%a!a()a,a0a4RoC=]o;Ju(!%RoGRhdwjh`=]oAg>w#Ro?g5vuRo=NvdRl|Ku]C.!&;RoEJvB!%RoORoMBx'h[v+_?w~h`}~5?w~hd~!xKh]oiptu-utv.vp!#%&a30a@a'a+(a/aOp(o~p!RoDJu(!%RoHRhewjha=]oBNvdRl}g>w#Ro@g5vuRo>c[#X']o<CauRoRAd-#Y':RkpauRoQKu]C.!&;RoFJvB!%RoNRoPBx'h]v+_?w~ha}t5?w~he}ue!/UbhYacXaW^Tc&a;b:a-c/#b&aja1(!cL+!bKbt!bmcRc9aIc?8[yW3Dtt94Rg`Jv}!&SiRMzBhEebShEMNuPRe>x7gL#TzuwjirRipc<Z&>on;>z=h-MSh.Mwqczx'a7vj&!>Re4@=ResJt__NuPRi*NuPRi)j]uNr|~FRfzKrJ>_+@Wfy@Wf]2WocKrJ<!+'@Wg%g/QRl@@Jv`!&awRl<wsfFIzgLu(w*!.*&ShBMwvhIRhI9;RhNx1hK'!#Sn]Mx1hK~0!#:2<H~7cNu+w7D*'1ZtW>Rn1~?rOc:Z&Rn2=<rQ<7wjh&=BSnLMc]#X(6Vz)w[b=a!U#9wzgMc3#&(RgMRitRis<x,gKt`ax!&+SioM=BSilMc3#&(RgKRinRimKurB,!&SiQMzBhDebShDM6BJQ!(P~Efx978B2@@=I}WLrJw!!,a*&@G}O@9wkibRid@@x'fKwC!&SlDMSfLMjUv~Q~EfKKv3@a+!(hFv-]mpx/hYZ(C5RiWz<o/MwkhY?So/M@x,gbvfB*&!SgEM:SoeeehFu3:Rgbda(,^TZa)X/7Sg[eb:2RgI~BrMC@wgkc:wwkcRerx3h(uUvK!&*,SnOM4Sh*MArRg;wHRh(x=h;rJvPwI!a4',a'0@Wg&=BSh/Mg>w=Rh=g3w*wwgGRgGcW(X#;Sg}M2Gzk@Jv`!&awRl=wsfGIz`dKZ*T'Y-:RhR7RhQg5u-p`j6v(us5d,#Y+~Awkia?RicOuNBwkibba}Ld6p~tyu_vbAa'a+!a/'a3aEa8a!>Sh,ebJv{!&Sh@ebSaReb9;SgwebNuPRi(NvdRl)NuPRi'hHu^<Rm^Jvv_@Wl(g;u1Si/ebKu'B&!*Sh?eb@Wl'z@aPeb95Si.ebcpputyvjB)!,&a+0a%ShAMWeK@G}C@WfJ9;RhMwvhH9w{ia}ix,hJvRA1(!zAn[MRhHx1hJ~*!#hFv(BSn[MBJQ!(@@=I~'978B2@@=I}2db.Ua<'X}+T#a0XaG2G}E;wkg|wuh!Rh!x,hZu,@)!&So0MVy)C5RiXACJvB!&5RiY5RiZg8w)cG}*T#2@bU}=KsA>(!a.3wkhZba~(x,h^u(A!&(SoCMRhb5Bz=h[eb?w~hb~6x,h_u(A!&(SoDMRhc5Bz=h]eb?w~hc~6e)aA1T#T,^^^c-bMb&blcPaP(a/!0!bA=b5c@a(!bfbrc#2afwmhARnjwchORnp2Wlf3DtsNvdRl-2@wpa<]m0bx(#:awRk2@Jw3!%RfhwpfgRlnKQB%!(G{V@G|'NuuRl6d='T+Y#VyUg<v~Rl~==G|<Jv+'!aYShC}6@B<5?ba~8@Jw3'!g2QRljhLrpWlOd+#Y'g.w'rIg>w*wgj@g-u0Rj@Lu+wT&)ZtUauq]~GrGci&U#F|39:rELrNvj!.%*RhCwunfw~nf~:9;Ri]>wtnhg;wHRnhx3hDs@v~!/+'@Wfr@9RkSNu&Rlo=@<5GzoKs0@_+@Wl+@awRkmJuh!-3d(}pY#qWJvj!%Rm(:Jw3!%Rm,Rm*de&!1U-U#`)Re;@G|.@9Ri82@wjfvRlq=@<5GzpLvOvr!).&2RlF8Rf`C=x!eE{.Jw3_g2QRlkhLrpWlPde(!#U{s,UXa*Ta'[y'g:v>ReS;x0PZ&RnlRnn~HrKJw1}f!=x!eB|2w]aP(#Xa&a*Ta.Ua2a7=]iOd'#Y&Ro&WnWg;u.RiDg6vjRiBNvdRlzhNvj]nYJuW_2Wm3x)kFze{9d])!a.!,Y01!#&aC!a3RndC=ox~BrC@2b^{pg,rlse7x'ksuq!%Rm.E{xidw(wBRmGx9o+)X#wwo-So-}69:Rl4@xSf@a#XZ'X)X,Ta(/ARl8b[xc>RfY:RlI:RfQwlg.ARl:9;Rlwdn'#^XafaQa1X1TaHTa)@b[{zcZ#X'7RkwWg@Ou4ARn&x)kG#{,g7u/RkGdH'U#Y*Vz'Wm&CARm|bx#(A]gUbUzJj9Q~=d,#Y(56H}l978H{U7d,0#U*2>ABb_xZ978BbU{e~AJQ{g!978BbU{hxMh?ad{oUYZ.x1h?{l!#:2<H{mx3n[t{vl!,&a%3Ro(z=iS}6ARnr=Bwsn^wvn`Rnbd`*T}B0!#^X'BG{c9b]{a>>@=be}F?JvS!&BG{d7BG}(Bde#`a1X,Ya@!a'P~=wxf@2bZ}I56B2@@=aybb}08@55B9;5bb}<j3vLv;<Jw3&!>Rfg=ayb^}&OuNBKuLA!)a!P~=x#fD{f2@>==<bbzl?C972@@=Ix^d6rSu,v7w*C(0a)a6#B+a%!sQ[y?3Dt%3[xn~<5rLOu!5p@Ku+D#'!t7~GrP~?rNKvlaya7'!h+v-5qMg=t|cd,U#5AAaa5Abb{S@52B5@a[@52B5Gx[iXueu;d<#`a(!/549C;ag>23ExY5@Dah89b^~689Jv)!~2b[~1Lv'w(%*!a#bX|aPrmawRe]keu7uhv-q6rxu,q`xTo]/a5aU!bNaDXbi!b-!ao!b<bwA!#5@B932:aV2G|:d-)Y#hJrL>RhG<7@C5<H|_=Cau:5aj5@B932:bJ|ng>vIbs)#?C2F|9jPv0w.vISh-MKvUaz(.!9ABbb|[5;5<H|Eg>unwfh;9:4E|YjQsBt|vjx'hYq3!(?C2F|J:2<BaY?C2F|GOu!5x,g|p{ah!-(?C2F|c9:4E|OjXuvvNr}:Rh&i[w*t|cd+U#jJvsu)vsSn~Mkfrmu9p}u7vwv]So!McW#Xa!ax5@A5aY:5;5<H|>kJv~vYrquJu3x4ib#T)2@SmZM?C2F|Bj:rmu9@xPhI(a*a#U#`a3-5Abb|L~@:RhK9:4E|0@52B5G|#C::aY?C2F|-:2<BaY?C2F|.5Jvk!a)javYrquJu3x4ia#T)2@SmYM?C2F|HAxPhH(!a#U#`a*-5Abb|4~@:RhJ9:4E|R@52B5G|F:2<BaY?C2F|Sc^#Xa2j=Qq5CJvB!-g<v{z;hhM?C2F|Zi[vrv{z;hiM?C2F|XKsA>!a)-g<v{z;h[eb?C2F|]i[vrv{z;h]eb?C2F|^iZu.vix,hZq3ah!.(?C2F|QOu!5ShXM:2<BaY?C2F|P", 13494, 2713, 49, 25, 61);

// node_modules/markdown-it/node_modules/entities/dist/internal/bin-trie-flags.js
var BinTrieFlags;
(function(BinTrieFlags2) {
  BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
  BinTrieFlags2[BinTrieFlags2["FLAG13"] = 8192] = "FLAG13";
  BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 8064] = "BRANCH_LENGTH";
  BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
  BinTrieFlags2[BinTrieFlags2["VALUE_MASK"] = 8191] = "VALUE_MASK";
})(BinTrieFlags || (BinTrieFlags = {}));

// node_modules/markdown-it/node_modules/entities/dist/decode.js
var CharCodes;
(function(CharCodes2) {
  CharCodes2[CharCodes2["AMP"] = 38] = "AMP";
  CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
  CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
  CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
  CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
  CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
  CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
  CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
})(CharCodes || (CharCodes = {}));
var TO_LOWER_BIT = 32;
var CONSUMED_SHIFT = 21;
var CODE_POINT_MASK = 2097151;
var CONSUMED_OVERFLOW = 2047;
var longNumericConsumed = 0;
function unpackConsumed(packed) {
  const consumed = packed >>> CONSUMED_SHIFT;
  return consumed === CONSUMED_OVERFLOW ? longNumericConsumed : consumed;
}
function isNumber(code2) {
  return code2 - CharCodes.ZERO >>> 0 <= 9;
}
function isHexadecimalCharacter(code2) {
  return (code2 | TO_LOWER_BIT) - CharCodes.LOWER_A >>> 0 <= 5;
}
function isAlpha(code2) {
  return (code2 | TO_LOWER_BIT) - CharCodes.LOWER_A >>> 0 <= 25;
}
function isEntityInAttributeInvalidEnd(code2) {
  return code2 === CharCodes.EQUALS || isAlpha(code2) || isNumber(code2);
}
var EntityDecoderState;
(function(EntityDecoderState2) {
  EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
  EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
  EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
  EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
  EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
})(EntityDecoderState || (EntityDecoderState = {}));
var DecodingMode;
(function(DecodingMode2) {
  DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
  DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
  DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
})(DecodingMode || (DecodingMode = {}));
function determineBranch(decodeTree, current, nodeIndex, char) {
  const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
  const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
  if (jumpOffset) {
    if (branchCount === 0) {
      return char === jumpOffset ? nodeIndex : -1;
    }
    const slot = char - jumpOffset;
    if (slot >>> 0 >= branchCount)
      return -1;
    const stored = decodeTree[nodeIndex + slot];
    return stored === 0 ? -1 : nodeIndex + branchCount + stored - 1 & 65535;
  }
  if (branchCount === 0)
    return -1;
  const packedKeySlots = branchCount + 1 >> 1;
  const branchEnd = nodeIndex + packedKeySlots + branchCount;
  for (let index = 0; index < branchCount; index++) {
    const packed = decodeTree[nodeIndex + (index >> 1)];
    const key = packed >> ((index & 1) << 3) & 255;
    if (key === char) {
      const pointerIndex = nodeIndex + packedKeySlots + index;
      return branchEnd + decodeTree[pointerIndex] & 65535;
    }
    if (key > char)
      return -1;
  }
  return -1;
}
function readTrieValue(decodeTree, nodeIndex, valueLength) {
  if (valueLength === 1) {
    return String.fromCharCode(decodeTree[nodeIndex] & BinTrieFlags.VALUE_MASK);
  }
  if (valueLength === 2) {
    return String.fromCharCode(decodeTree[nodeIndex + 1]);
  }
  return String.fromCharCode(decodeTree[nodeIndex + 1], decodeTree[nodeIndex + 2]);
}
function parseNumericEntity(input, numberStart, inputLength) {
  let offset = numberStart + 1;
  let cp = 0;
  let digitStart = offset;
  if (offset < inputLength && (input.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
    offset += 1;
    digitStart = offset;
    while (offset < inputLength) {
      const char = input.charCodeAt(offset);
      if (isNumber(char)) {
        cp = cp * 16 + (char - CharCodes.ZERO);
      } else if (isHexadecimalCharacter(char)) {
        cp = cp * 16 + ((char | TO_LOWER_BIT) - CharCodes.LOWER_A + 10);
      } else {
        break;
      }
      offset += 1;
    }
  } else {
    while (offset < inputLength) {
      const digit = input.charCodeAt(offset) - CharCodes.ZERO;
      if (digit >>> 0 > 9)
        break;
      cp = cp * 10 + digit;
      offset += 1;
    }
  }
  if (offset === digitStart)
    return 0;
  if (offset < inputLength && input.charCodeAt(offset) === CharCodes.SEMI) {
    offset += 1;
  }
  if (cp > 1114111)
    cp = 1114112;
  let consumed = offset - numberStart;
  if (consumed >= CONSUMED_OVERFLOW) {
    longNumericConsumed = consumed;
    consumed = CONSUMED_OVERFLOW;
  }
  return consumed << CONSUMED_SHIFT | cp;
}
function decodeWithTrie(input, isStrict, isAttribute) {
  const decodeTree = htmlDecodeTree;
  let offset = input.indexOf("&");
  if (offset < 0)
    return input;
  const inputLength = input.length;
  let chunkStart = 0;
  let result = "";
  const root = decodeTree[0];
  const rootJumpOffset = root & BinTrieFlags.JUMP_TABLE;
  const rootBranchCount = (root & BinTrieFlags.BRANCH_LENGTH) >> 7;
  do {
    const entityStart = offset + 1;
    const firstChar = input.charCodeAt(entityStart);
    let consumed;
    let value;
    if (firstChar === CharCodes.NUM) {
      const packed = parseNumericEntity(input, entityStart, inputLength);
      consumed = unpackConsumed(packed);
      if (isStrict && consumed > 0 && input.charCodeAt(entityStart + consumed - 1) !== CharCodes.SEMI) {
        consumed = 0;
      }
      value = consumed === 0 ? "" : codePointToString(packed & CODE_POINT_MASK);
    } else if (isAlpha(firstChar)) {
      consumed = 0;
      value = "";
      const rootSlotIndex = firstChar - rootJumpOffset;
      let nodeIndex;
      if (rootSlotIndex >>> 0 < rootBranchCount) {
        const stored = decodeTree[1 + rootSlotIndex];
        nodeIndex = stored === 0 ? -1 : rootBranchCount + stored & 65535;
      } else {
        nodeIndex = -1;
      }
      let bestNodeIndex = 0;
      let bestValueLength = 0;
      let current = nodeIndex < 0 ? 0 : decodeTree[nodeIndex];
      let index = entityStart + 1;
      trie: while (index < inputLength) {
        while (
          // Value-less, non-run node with a nonzero jump offset.
          (current & (BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13)) === 0 && (current & BinTrieFlags.JUMP_TABLE) !== 0
        ) {
          const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
          const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
          if (branchCount === 0) {
            if (input.charCodeAt(index) !== jumpOffset)
              break trie;
            nodeIndex += 1;
          } else {
            const slot = input.charCodeAt(index) - jumpOffset;
            if (slot >>> 0 >= branchCount)
              break trie;
            const stored = decodeTree[nodeIndex + 1 + slot];
            if (stored === 0)
              break trie;
            nodeIndex = nodeIndex + branchCount + stored & 65535;
          }
          current = decodeTree[nodeIndex];
          index += 1;
          if (index >= inputLength)
            break trie;
        }
        if ((current & (BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13)) === BinTrieFlags.FLAG13) {
          const runLength = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
          if (input.charCodeAt(index) !== (current & BinTrieFlags.JUMP_TABLE)) {
            break;
          }
          index += 1;
          const remaining = runLength - 1;
          let wordIndex = nodeIndex + 1;
          let charIndexInPacked = 0;
          for (; charIndexInPacked + 1 < remaining; charIndexInPacked += 2) {
            const packed = decodeTree[wordIndex];
            if (input.charCodeAt(index) !== (packed & 255))
              break trie;
            index += 1;
            if (input.charCodeAt(index) !== (packed >> 8 & 255))
              break trie;
            index += 1;
            wordIndex += 1;
          }
          if (charIndexInPacked < remaining) {
            if (input.charCodeAt(index) !== (decodeTree[wordIndex] & 255))
              break;
            index += 1;
          }
          nodeIndex += 1 + (runLength >> 1);
          current = decodeTree[nodeIndex];
          continue;
        }
        const valueLength = current >>> 14;
        const char = input.charCodeAt(index);
        if (valueLength !== 0) {
          if (char === CharCodes.SEMI) {
            consumed = index - entityStart + 1;
            value = valueLength === 1 ? String.fromCharCode(current & BinTrieFlags.VALUE_MASK) : readTrieValue(decodeTree, nodeIndex, valueLength);
            break;
          }
          if (!isStrict && (current & BinTrieFlags.FLAG13) === 0) {
            consumed = index - entityStart;
            bestNodeIndex = nodeIndex;
            bestValueLength = valueLength;
          }
          if (valueLength === 1)
            break;
        }
        const next = determineBranch(decodeTree, current, nodeIndex + (valueLength || 1), char);
        if (next < 0)
          break;
        nodeIndex = next;
        current = decodeTree[nodeIndex];
        index += 1;
      }
      if (value === "") {
        const finalVL = current >>> 14;
        if (finalVL !== 0 && !isStrict && (current & BinTrieFlags.FLAG13) === 0) {
          consumed = index - entityStart;
          bestNodeIndex = nodeIndex;
          bestValueLength = finalVL;
        }
        if (consumed > 0) {
          value = readTrieValue(decodeTree, bestNodeIndex, bestValueLength);
        }
      }
    } else {
      consumed = 0;
      value = "";
    }
    if (consumed === 0 || isAttribute && firstChar !== CharCodes.NUM && input.charCodeAt(entityStart + consumed - 1) !== CharCodes.SEMI && entityStart + consumed < inputLength && isEntityInAttributeInvalidEnd(input.charCodeAt(entityStart + consumed))) {
      offset = entityStart;
    } else {
      if (chunkStart < offset) {
        result += input.slice(chunkStart, offset);
      }
      result += value;
      offset = chunkStart = entityStart + consumed;
    }
    if (input.charCodeAt(offset) !== CharCodes.AMP) {
      offset = input.indexOf("&", offset);
    }
  } while (offset >= 0);
  return result + input.slice(chunkStart);
}
function decodeHTMLStrict(htmlString) {
  return decodeWithTrie(htmlString, true, false);
}

// node_modules/markdown-it/node_modules/entities/dist/index.js
var EntityLevel;
(function(EntityLevel2) {
  EntityLevel2[EntityLevel2["XML"] = 0] = "XML";
  EntityLevel2[EntityLevel2["HTML"] = 1] = "HTML";
})(EntityLevel || (EntityLevel = {}));
var EncodingMode;
(function(EncodingMode2) {
  EncodingMode2[EncodingMode2["UTF8"] = 0] = "UTF8";
  EncodingMode2[EncodingMode2["ASCII"] = 1] = "ASCII";
  EncodingMode2[EncodingMode2["Extensive"] = 2] = "Extensive";
  EncodingMode2[EncodingMode2["Attribute"] = 3] = "Attribute";
  EncodingMode2[EncodingMode2["Text"] = 4] = "Text";
})(EncodingMode || (EncodingMode = {}));

// node_modules/linkify-it/build/index.mjs
var REBuilder = class {
  src_Any = Any.source;
  src_Cc = Cc.source;
  src_Z = Z.source;
  src_P = P.source;
  src_ZPCc = [
    this.src_Z,
    this.src_P,
    this.src_Cc
  ].join("|");
  src_ZCc = [this.src_Z, this.src_Cc].join("|");
  cache = {};
  opts = {
    maxLength: 1e4,
    urlAuth: false,
    schema_names: []
  };
  constructor(opts = {}) {
    this.opts = {
      ...this.opts,
      ...opts
    };
  }
  set(opts = {}) {
    this.opts = {
      ...this.opts,
      ...opts
    };
    this.cache = {};
    return this;
  }
  escapeRE(str) {
    return str.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
  }
  nestedPairRE(open, close, depth = 4) {
    const openRE = this.escapeRE(open);
    const closeRE = this.escapeRE(close);
    const atom = `(?:(?!${this.src_ZCc}|${openRE}|${closeRE}).)`;
    let pair = `${openRE}${atom}{0,1000}${closeRE}`;
    for (let level = 2; level <= depth; level++) pair = `${openRE}(?:${atom}|${pair}){0,1000}${closeRE}`;
    return pair;
  }
  get_text_separators() {
    return this.cache.text_separators ??= /[><\uff5c]/;
  }
  get_pseudo_letter() {
    return this.cache.src_pseudo_letter ??= new RegExp(`(?:(?!${this.get_text_separators().source}|${this.src_ZPCc})${this.src_Any})`);
  }
  get_ipv4_addr() {
    return this.cache.src_ip4 ??= /* @__PURE__ */ new RegExp("(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])[.]){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])");
  }
  get_ipv6_addr() {
    const h16 = "[0-9A-Fa-f]{1,4}";
    const ls32 = `(?:(?:${h16}:${h16})|${this.get_ipv4_addr().source})`;
    return this.cache.src_ip6_addr ??= new RegExp(`(?:(?:${h16}:){6}${ls32}|::(?:${h16}:){5}${ls32}|(?:${h16})?::(?:${h16}:){4}${ls32}|(?:(?:${h16}:){0,1}${h16})?::(?:${h16}:){3}${ls32}|(?:(?:${h16}:){0,2}${h16})?::(?:${h16}:){2}${ls32}|(?:(?:${h16}:){0,3}${h16})?::${h16}:${ls32}|(?:(?:${h16}:){0,4}${h16})?::${ls32}|(?:(?:${h16}:){0,5}${h16})?::${h16}|(?:(?:${h16}:){0,6}${h16})?::)`);
  }
  get_ipv6_url_host() {
    return this.cache.src_ip6_host ??= new RegExp(`\\[${this.get_ipv6_addr().source}\\]`);
  }
  get_ipv6_mail_host() {
    return this.cache.src_ipv6_mail_host ??= new RegExp(`\\[IPv6:${this.get_ipv6_addr().source}\\]`);
  }
  get_auth() {
    return this.cache.src_auth ??= new RegExp(`(?:(?:(?!${this.src_ZCc}|[@/\\[\\]()]).){1,50}@)?`);
  }
  get_port() {
    return this.cache.src_port ??= /* @__PURE__ */ new RegExp("(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?");
  }
  get_host_terminator() {
    return this.cache.src_host_terminator ??= new RegExp(`(?=$|${this.get_text_separators().source}|${this.src_ZPCc})(?!${this.opts["---"] ? "-(?!--)|" : "-|"}_|:\\d|\\.-|\\.(?!$|${this.src_ZPCc}))`);
  }
  get_path_terminator() {
    return this.cache.src_path_terminator ??= new RegExp(`${this.src_ZPCc}|${this.get_text_separators().source}`);
  }
  get_path() {
    return this.cache.src_path ??= new RegExp(`(?:[/?#](?:${this.nestedPairRE("[", "]")}|${this.nestedPairRE("(", ")")}|${this.nestedPairRE("{", "}")}|\\"(?:(?!${this.src_ZCc}|["]).){1,100}\\"|\\'(?:(?!${this.src_ZCc}|[']).){1,100}\\'|\\'(?=${this.get_pseudo_letter().source}|[-])|\\.{2,20}[:]?[a-zA-Z0-9%/&]|\\.(?!${this.src_ZCc}|[.]|$)|` + (this.opts["---"] ? "\\-(?!--(?:[^-]|$))(?:-{0,19})|" : "\\-{1,20}|") + `,(?!${this.src_ZCc}|$)|;(?!${this.src_ZCc}|$)|\\!{1,20}(?!${this.src_ZCc}|[!]|$)|\\?(?!${this.src_ZCc}|[?]|$)|` + this.get_path_extra().source + `[\\\\/:%@#&=_~*]|(?!${this.get_path_terminator().source}).){1,${this.opts.maxLength}}|\\/)?`);
  }
  get_mail_name() {
    return this.cache.src_mail_name ??= /* @__PURE__ */ new RegExp("[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9](?:[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9]|[.](?=[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9])){0,63}");
  }
  get_xn() {
    return this.cache.src_xn ??= /* @__PURE__ */ new RegExp("xn--[a-z0-9\\-]{1,59}");
  }
  get_tld() {
    if (this.cache.tld) return this.cache.tld;
    const tlds_src = [...new Set(this.opts.tlds || [])].sort().reverse().join("|");
    this.cache.tld = new RegExp(`${tlds_src || "$#none#$"}|${this.get_xn().source}`);
    return this.cache.tld;
  }
  get_domain_root() {
    return this.cache.src_domain_root ??= new RegExp("(?:" + this.get_xn().source + `|${this.get_pseudo_letter().source}{1,63})`);
  }
  get_domain() {
    return this.cache.src_domain ??= new RegExp("(?:" + this.get_xn().source + `|(?:${this.get_pseudo_letter().source})|(?:${this.get_pseudo_letter().source}(?:-|${this.get_pseudo_letter().source}){0,61}${this.get_pseudo_letter().source}))`);
  }
  get_url_host_port() {
    return this.cache.url_host_port ??= new RegExp("(?:" + this.get_ipv6_url_host().source + `|(?:(?:(?:${this.get_domain().source})\\.){0,10}${this.get_domain().source}))` + this.get_port().source + this.get_host_terminator().source);
  }
  get_fuzzy_url_host_port() {
    return this.cache.fuzzy_url_host_port ??= new RegExp("(?:" + (this.opts.fuzzyIP ? this.get_ipv4_addr().source + "|" : "") + `(?:(?:(?:${this.get_domain().source})\\.){1,10}(?:${this.get_tld().source})))` + this.get_host_terminator().source);
  }
  get_mail_host() {
    return this.cache.src_mail_host ??= new RegExp("(?:" + this.get_ipv6_mail_host().source + `|(?:(?:(?:${this.get_domain().source})\\.){0,4}${this.get_domain().source}))` + this.get_host_terminator().source);
  }
  get_fuzzy_mail_host() {
    return this.cache.src_fuzzy_mail_host ??= new RegExp("(?:" + this.get_ipv6_mail_host().source + `|(?:(?:(?:${this.get_domain().source})[.]){1,4}${this.get_domain_root().source}))` + this.get_host_terminator().source);
  }
  get_path_extra() {
    return this.cache.src_path_extra ??= /* @__PURE__ */ new RegExp("");
  }
  get_fuzzy_mail_host_search() {
    return this.cache.mail_fuzzy_host_search ??= new RegExp(`@${this.get_fuzzy_mail_host().source}`, "ig");
  }
  get_fuzzy_link_search() {
    return this.cache.link_fuzzy_search ??= new RegExp(`(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uFF5C]|${this.src_ZPCc}))(?:(?![$+<=>^\`|\uFF5C])${this.get_fuzzy_url_host_port().source}${this.get_path().source})`, "ig");
  }
  get_http_validator() {
    return this.cache.http_validator ??= new RegExp("\\/\\/" + (this.opts.urlAuth ? this.get_auth().source : "") + this.get_url_host_port().source + this.get_path().source, "iy");
  }
  get_relative_proto_validator() {
    return this.cache.relative_proto_validator ??= new RegExp((this.opts.urlAuth ? this.get_auth().source : "") + `(?:localhost|${this.get_ipv6_url_host().source}|(?:(?:${this.get_domain().source})[.]){1,10}${this.get_domain_root().source})` + this.get_port().source + this.get_host_terminator().source + this.get_path().source, "iy");
  }
  get_mail_name_validator() {
    return this.cache.mail_name_validator ??= new RegExp(`(?:^|${this.get_text_separators().source}|"|\\(|${this.src_ZCc})(${this.get_mail_name().source})$`);
  }
  get_mailto_validator() {
    return this.cache.mailto_validator ??= new RegExp(`${this.get_mail_name().source}@${this.get_mail_host().source}`, "iy");
  }
  get_schema_names() {
    return this.cache.schema_names ??= new RegExp((this.opts.schema_names || []).map((name) => this.escapeRE(name)).join("|"));
  }
  get_schema_search() {
    return this.cache.schema_search ??= new RegExp(`(^|(?!_)(?:[><\uFF5C]|${this.src_ZPCc}))(${this.get_schema_names().source})`, "ig");
  }
  get_schema_at_start() {
    return this.cache.schema_at_start ??= new RegExp(`^${this.get_schema_search().source}`, "i");
  }
};
var web_schema = {
  validate: (text2, pos, self) => {
    const re = self.re.get_http_validator();
    re.lastIndex = pos;
    const m = re.exec(text2);
    return m ? m[0].length : 0;
  },
  normalize: (match, self) => self.normalize(match)
};
var defaultSchemas = {
  "http:": web_schema,
  "https:": web_schema,
  "ftp:": web_schema,
  "//": {
    validate: function(text2, pos, self) {
      const re = self.re.get_relative_proto_validator();
      re.lastIndex = pos;
      const m = re.exec(text2);
      if (m) {
        if (pos >= 3 && text2[pos - 3] === ":") return 0;
        if (pos >= 3 && text2[pos - 3] === "/") return 0;
        return m[0].length;
      }
      return 0;
    },
    normalize: (match, self) => self.normalize(match)
  },
  "mailto:": {
    validate: function(text2, pos, self) {
      const re = self.re.get_mailto_validator();
      re.lastIndex = pos;
      const m = re.exec(text2);
      return m ? m[0].length : 0;
    },
    normalize: (match, self) => self.normalize(match)
  }
};
var tlds_2ch = "a:cdefgilmnoqrstuwxz|b:abdefghijmnorstvwyz|c:acdfghiklmnoruvwxyz|d:ejkmoz|e:cegrstu|f:ijkmor|g:abdefghilmnpqrstuwy|h:kmnrtu|i:delmnoqrst|j:emop|k:eghimnprwyz|l:abcikrstuvy|m:acdeghklmnopqrstuvwxyz|n:acefgilopruz|o:m|p:aefghklmnrstwy|q:a|r:eosuw|s:abcdeghijklmnortuvxyz|t:cdfghjklmnortvwz|u:agksyz|v:aceginu|w:fs|y:et|z:amw";
var tlds_default = "biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|\u0440\u0444";
function unpackTlds() {
  const result = tlds_default.split("|");
  tlds_2ch.split("|").forEach((item) => {
    const sep = item.indexOf(":");
    const prefix = item.slice(0, sep);
    for (const suffix of item.slice(sep + 1)) result.push(prefix + suffix);
  });
  return result;
}
var defaultOptions = {
  fuzzyLink: false,
  fuzzyEmail: true,
  fuzzyIP: false,
  "---": false,
  tlds: unpackTlds(),
  urlAuth: false,
  maxLength: 1e4
};
var Match = class {
  /** Prefix (protocol) for matched string. Empty for fuzzy links. */
  schema;
  /** First position of matched string. */
  index;
  /** Next position after matched string. */
  lastIndex;
  /** Matched string. */
  raw;
  /** Normalized text of matched string. */
  text;
  /** Normalized URL of matched string. */
  url;
  constructor(text2, schema, index, lastIndex) {
    const raw = text2.slice(index, lastIndex);
    this.schema = schema.toLowerCase();
    this.index = index;
    this.lastIndex = lastIndex;
    this.raw = raw;
    this.text = raw;
    this.url = raw;
  }
};
var LinkifyIt = class {
  __opts__;
  __schemas__;
  re;
  /**
  * Creates new linkifier instance.
  *
  * By default understands:
  *
  * - `http(s)://...` , `ftp://...`, `mailto:...` & `//...` links
  * - "fuzzy" emails (foo@bar.com).
  *
  * See {@link LinkifyConstructorOptions} for available options.
  *
  * @param options Recognition options.
  *
  * @example
  * ```javascript
  * import { LinkifyIt } from 'linkify-it'
  *
  * const linkify = new LinkifyIt({ fuzzyLink: true })
  *
  * linkify
  *   .tlds(require('tlds'))       // Reload with full TLD list
  *   .tlds('onion', true)         // Add unofficial `.onion` domain
  *   .add('ftp:', null)           // Disable `ftp:` protocol
  *   .set({ fuzzyIP: true })      // Enable IPs in fuzzy links
  *
  * console.log(linkify.test('Site github.com!')) // true
  * console.log(linkify.match('Site github.com!'))
  * ```
  */
  constructor(options = {}) {
    const { rebuilder, ...linkifyOptions } = options;
    this.__opts__ = {
      ...defaultOptions,
      ...linkifyOptions
    };
    this.__schemas__ = { ...defaultSchemas };
    this.re = rebuilder || new REBuilder();
    this.re.set({
      ...this.__opts__,
      schema_names: Object.keys(this.__schemas__)
    });
  }
  /**
  * Add new rule definition.
  *
  * `schema` is a link prefix (usually, protocol name with `:` at the end,
  * `skype:` for example). `linkify-it` makes sure that prefix is not
  * preceded with alphanumeric char and symbols. Only whitespaces and
  * punctuation allowed.
  *
  * `definition` is a rule to check tail after link prefix. To disable an
  * existing rule, pass `null`.
  *
  * @param schema Rule name (fixed pattern prefix).
  * @param definition Schema definition, or `null` to disable the rule.
  *
  * See [twitter mentions example](https://github.com/markdown-it/linkify-it/blob/master/examples/twitter.mjs).
  */
  add(schema, definition = null) {
    if (!definition) delete this.__schemas__[schema];
    else {
      const def = {
        normalize: (match, self) => self.normalize(match),
        ...definition
      };
      this.__schemas__[schema] = def;
    }
    this.re.set({
      ...this.__opts__,
      schema_names: Object.keys(this.__schemas__)
    });
    return this;
  }
  /**
  * Set recognition options for links without schema.
  *
  * @param options Recognition options.
  */
  set(options = {}) {
    this.__opts__ = {
      ...this.__opts__,
      ...options
    };
    this.re.set({
      ...this.__opts__,
      schema_names: Object.keys(this.__schemas__)
    });
    return this;
  }
  /**
  * Searches linkifiable pattern and returns `true` on success or `false` on fail.
  *
  * @param text Text to scan.
  */
  test(text2) {
    if (!text2.length) return false;
    let m, re;
    re = this.re.get_schema_search();
    re.lastIndex = 0;
    while ((m = re.exec(text2)) !== null) if (this.testSchemaAt(text2, m[2], re.lastIndex)) return true;
    if (this.__opts__.fuzzyLink && this.__schemas__["http:"]) {
      re = this.re.get_fuzzy_link_search();
      re.lastIndex = 0;
      if (re.exec(text2) !== null) return true;
    }
    if (this.__opts__.fuzzyEmail && this.__schemas__["mailto:"]) {
      if (text2.indexOf("@") >= 0) {
        const mailHostRe = this.re.get_fuzzy_mail_host_search();
        const mailNameRe = this.re.get_mail_name_validator();
        mailHostRe.lastIndex = 0;
        while ((m = mailHostRe.exec(text2)) !== null) {
          const name = text2.slice(Math.max(0, m.index - 65), m.index);
          if (mailNameRe.test(name)) return true;
        }
      }
    }
    return false;
  }
  /**
  * Similar to {@link LinkifyIt.test} but checks only specific protocol tail exactly
  * at given position. Returns length of found pattern (0 on fail).
  *
  * @param text Text to scan.
  * @param schema Rule (schema) name.
  * @param pos Text offset to check from.
  */
  testSchemaAt(text2, schema, pos) {
    if (!this.__schemas__[schema.toLowerCase()]) return 0;
    return this.__schemas__[schema.toLowerCase()].validate(text2.slice(0, pos + this.__opts__.maxLength), pos, this);
  }
  /**
  * Returns array of found link descriptions or `null` on fail. We strongly
  * recommend to use {@link LinkifyIt.test} first, for best speed.
  *
  * @param text Text to scan.
  */
  match(text2) {
    const result = [];
    const schemaRe = this.re.get_schema_search();
    let fuzzyLinkRe;
    let mailHostRe;
    let mailNameRe;
    let fuzzyLinkCandidate;
    let fuzzyEmailCandidate;
    let schemaPrefix;
    let schemaDone = false;
    let fuzzyLinkDone = false;
    let fuzzyEmailDone = false;
    let pos = 0;
    if (!text2.length) return null;
    schemaRe.lastIndex = 0;
    if (this.__opts__.fuzzyLink && this.__schemas__["http:"]) {
      fuzzyLinkRe = this.re.get_fuzzy_link_search();
      fuzzyLinkRe.lastIndex = 0;
    }
    if (this.__opts__.fuzzyEmail && this.__schemas__["mailto:"]) {
      mailHostRe = this.re.get_fuzzy_mail_host_search();
      mailHostRe.lastIndex = 0;
      mailNameRe = this.re.get_mail_name_validator();
    }
    for (; ; ) {
      const scanFrom = Math.max(pos - 1, 0);
      if (mailHostRe && mailNameRe && !fuzzyEmailDone && (!fuzzyEmailCandidate || fuzzyEmailCandidate.index < pos)) {
        if (mailHostRe.lastIndex < scanFrom) mailHostRe.lastIndex = scanFrom;
        for (; ; ) {
          const m = mailHostRe.exec(text2);
          if (!m) {
            fuzzyEmailDone = true;
            fuzzyEmailCandidate = void 0;
            break;
          }
          const name = mailNameRe.exec(text2.slice(Math.max(0, m.index - 65), m.index));
          if (!name) continue;
          fuzzyEmailCandidate = {
            schema: "mailto:",
            index: m.index - name[1].length,
            lastIndex: m.index + m[0].length
          };
          if (fuzzyEmailCandidate.index >= pos) break;
          if (mailHostRe.lastIndex < scanFrom) mailHostRe.lastIndex = scanFrom;
        }
      }
      if (fuzzyLinkRe && !fuzzyLinkDone && (!fuzzyLinkCandidate || fuzzyLinkCandidate.index < pos)) {
        if (fuzzyLinkRe.lastIndex < scanFrom) fuzzyLinkRe.lastIndex = scanFrom;
        for (; ; ) {
          const m = fuzzyLinkRe.exec(text2);
          if (!m) {
            fuzzyLinkDone = true;
            fuzzyLinkCandidate = void 0;
            break;
          }
          fuzzyLinkCandidate = {
            schema: "",
            index: m.index + m[1].length,
            lastIndex: m.index + m[0].length
          };
          if (fuzzyLinkCandidate.index >= pos) break;
          if (fuzzyLinkRe.lastIndex < scanFrom) fuzzyLinkRe.lastIndex = scanFrom;
        }
      }
      let fuzzyCandidate = fuzzyEmailCandidate;
      if (!fuzzyCandidate || fuzzyLinkCandidate && (fuzzyLinkCandidate.index < fuzzyCandidate.index || fuzzyLinkCandidate.index === fuzzyCandidate.index && fuzzyLinkCandidate.lastIndex > fuzzyCandidate.lastIndex)) fuzzyCandidate = fuzzyLinkCandidate;
      let schemaCandidate;
      if (!schemaDone) for (; ; ) {
        if (!schemaPrefix) {
          if (schemaRe.lastIndex < scanFrom) schemaRe.lastIndex = scanFrom;
          const m = schemaRe.exec(text2);
          if (!m) {
            schemaDone = true;
            break;
          }
          schemaPrefix = {
            schema: m[2],
            index: m.index + m[1].length,
            lastIndex: m.index + m[0].length
          };
        }
        if (schemaPrefix.index < pos) {
          schemaPrefix = void 0;
          continue;
        }
        if (fuzzyCandidate && schemaPrefix.index > fuzzyCandidate.index) break;
        const prefix = schemaPrefix;
        schemaPrefix = void 0;
        const len = this.testSchemaAt(text2, prefix.schema, prefix.lastIndex);
        if (len) {
          schemaCandidate = {
            schema: prefix.schema,
            index: prefix.index,
            lastIndex: prefix.lastIndex + len
          };
          break;
        }
      }
      let candidate = schemaCandidate;
      if (!candidate || fuzzyEmailCandidate && (fuzzyEmailCandidate.index < candidate.index || fuzzyEmailCandidate.index === candidate.index && fuzzyEmailCandidate.lastIndex > candidate.lastIndex)) candidate = fuzzyEmailCandidate;
      if (!candidate || fuzzyLinkCandidate && (fuzzyLinkCandidate.index < candidate.index || fuzzyLinkCandidate.index === candidate.index && fuzzyLinkCandidate.lastIndex > candidate.lastIndex)) candidate = fuzzyLinkCandidate;
      if (!candidate) break;
      if (candidate === fuzzyEmailCandidate) fuzzyEmailCandidate = void 0;
      else if (candidate === fuzzyLinkCandidate) fuzzyLinkCandidate = void 0;
      const match = new Match(text2, candidate.schema, candidate.index, candidate.lastIndex);
      if (match.schema) this.__schemas__[match.schema].normalize(match, this);
      else this.normalize(match);
      result.push(match);
      pos = candidate.lastIndex;
    }
    if (result.length) return result;
    return null;
  }
  /**
  * Returns fully-formed (not fuzzy) link if it starts at the beginning
  * of the string, and null otherwise.
  *
  * @param text Text to scan.
  */
  matchAtStart(text2) {
    if (!text2.length) return null;
    const m = this.re.get_schema_at_start().exec(text2);
    if (!m) return null;
    const len = this.testSchemaAt(text2, m[2], m[0].length);
    if (!len) return null;
    const match = new Match(text2, m[2], m.index + m[1].length, m.index + m[0].length + len);
    this.__schemas__[match.schema].normalize(match, this);
    return match;
  }
  /**
  * Load (or merge) new TLDs list. Those are used for fuzzy links (without
  * prefix) to avoid false positives. By default this algorithm is used:
  *
  * - hostname with any 2-letter root zones are ok.
  * - biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф
  *   are ok.
  * - encoded (`xn--...`) root zones are ok.
  *
  * If list is replaced, then exact match for 2-chars root zones will be checked.
  *
  * @param list List of TLDs.
  * @param keepOld Merge with current list if `true` (`false` by default).
  */
  tlds(list2, keepOld = false) {
    list2 = Array.isArray(list2) ? list2 : [list2];
    if (!keepOld) this.__opts__.tlds = list2;
    else this.__opts__.tlds = this.__opts__.tlds.concat(list2);
    this.re.set({
      ...this.__opts__,
      schema_names: Object.keys(this.__schemas__)
    });
    return this;
  }
  /**
  * Default normalizer (if schema does not define its own).
  *
  * @param match Match to normalize.
  */
  normalize(match) {
    if (!match.schema) match.url = `http://${match.url}`;
    if (match.schema === "mailto:" && !/^mailto:/i.test(match.url)) match.url = `mailto:${match.url}`;
  }
};

// node_modules/markdown-it/dist/markdown-it.mjs
var import_punycode = __toESM(require_punycode(), 1);
var __defProp2 = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
  let target = {};
  for (var name in all) __defProp2(target, name, {
    get: all[name],
    enumerable: true
  });
  if (!no_symbols) __defProp2(target, Symbol.toStringTag, { value: "Module" });
  return target;
};
var utils_exports = /* @__PURE__ */ __exportAll({
  arrayReplaceAt: () => arrayReplaceAt,
  asciiTrim: () => asciiTrim,
  callable: () => callable,
  escapeHtml: () => escapeHtml,
  escapeRE: () => escapeRE,
  fromCodePoint: () => fromCodePoint,
  isMdAsciiPunct: () => isMdAsciiPunct,
  isPunctChar: () => isPunctChar,
  isPunctCharCode: () => isPunctCharCode,
  isSpace: () => isSpace,
  isValidEntityCode: () => isValidEntityCode,
  isWhiteSpace: () => isWhiteSpace,
  lib: () => lib,
  normalizeReference: () => normalizeReference,
  unescapeAll: () => unescapeAll,
  unescapeMd: () => unescapeMd
});
function callable(cls) {
  const wrapper = function(...args) {
    return Reflect.construct(cls, args, new.target && new.target !== wrapper ? new.target : cls);
  };
  Object.defineProperty(wrapper, "name", { value: cls.name });
  Object.setPrototypeOf(wrapper, cls);
  wrapper.prototype = cls.prototype;
  return wrapper;
}
function arrayReplaceAt(src, pos, newElements) {
  return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
}
function isValidEntityCode(c) {
  if (c >= 55296 && c <= 57343) return false;
  if (c >= 64976 && c <= 65007) return false;
  if ((c & 65535) === 65535 || (c & 65535) === 65534) return false;
  if (c >= 0 && c <= 8) return false;
  if (c === 11) return false;
  if (c >= 14 && c <= 31) return false;
  if (c >= 127 && c <= 159) return false;
  if (c > 1114111) return false;
  return true;
}
function fromCodePoint(c) {
  if (c > 65535) {
    c -= 65536;
    const surrogate1 = 55296 + (c >> 10);
    const surrogate2 = 56320 + (c & 1023);
    return String.fromCharCode(surrogate1, surrogate2);
  }
  return String.fromCharCode(c);
}
var UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
var UNESCAPE_ALL_RE = new RegExp(`${UNESCAPE_MD_RE.source}|${/&([a-z#][a-z0-9]{1,31});/gi.source}`, "gi");
var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;
function replaceEntityPattern(match, name) {
  if (name.charCodeAt(0) === 35 && DIGITAL_ENTITY_TEST_RE.test(name)) {
    const code2 = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (isValidEntityCode(code2)) return fromCodePoint(code2);
    return match;
  }
  const decoded = decodeHTMLStrict(match);
  if (decoded !== match) return decoded;
  return match;
}
function unescapeMd(str) {
  if (str.indexOf("\\") < 0) return str;
  return str.replace(UNESCAPE_MD_RE, "$1");
}
function unescapeAll(str) {
  if (str.indexOf("\\") < 0 && str.indexOf("&") < 0) return str;
  return str.replace(UNESCAPE_ALL_RE, function(match, escaped, entity2) {
    if (escaped) return escaped;
    return replaceEntityPattern(match, entity2);
  });
}
var HTML_ESCAPE_TEST_RE = /[&<>"]/;
var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
var HTML_REPLACEMENTS = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
};
function replaceUnsafeChar(ch) {
  return HTML_REPLACEMENTS[ch];
}
function escapeHtml(str) {
  if (HTML_ESCAPE_TEST_RE.test(str)) return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
  return str;
}
var REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;
function escapeRE(str) {
  return str.replace(REGEXP_ESCAPE_RE, "\\$&");
}
function isSpace(code2) {
  switch (code2) {
    case 9:
    case 32:
      return true;
  }
  return false;
}
function isWhiteSpace(code2) {
  if (code2 >= 8192 && code2 <= 8202) return true;
  switch (code2) {
    case 9:
    case 10:
    case 11:
    case 12:
    case 13:
    case 32:
    case 160:
    case 5760:
    case 8239:
    case 8287:
    case 12288:
      return true;
  }
  return false;
}
function isPunctChar(ch) {
  return P.test(ch) || S.test(ch);
}
function isPunctCharCode(code2) {
  return isPunctChar(fromCodePoint(code2));
}
function isMdAsciiPunct(ch) {
  switch (ch) {
    case 33:
    case 34:
    case 35:
    case 36:
    case 37:
    case 38:
    case 39:
    case 40:
    case 41:
    case 42:
    case 43:
    case 44:
    case 45:
    case 46:
    case 47:
    case 58:
    case 59:
    case 60:
    case 61:
    case 62:
    case 63:
    case 64:
    case 91:
    case 92:
    case 93:
    case 94:
    case 95:
    case 96:
    case 123:
    case 124:
    case 125:
    case 126:
      return true;
    default:
      return false;
  }
}
function normalizeReference(str) {
  str = str.trim().replace(/\s+/g, " ");
  return str.toLowerCase().toUpperCase();
}
function isAsciiTrimmable(c) {
  return c === 32 || c === 9 || c === 10 || c === 13;
}
function asciiTrim(str) {
  let start = 0;
  for (; start < str.length; start++) if (!isAsciiTrimmable(str.charCodeAt(start))) break;
  let end = str.length - 1;
  for (; end >= start; end--) if (!isAsciiTrimmable(str.charCodeAt(end))) break;
  return str.slice(start, end + 1);
}
var lib = {
  mdurl: mdurl_exports,
  ucmicro: build_exports
};
function parseLinkLabel(state, start, disableNested) {
  let level, found, marker, prevPos;
  const max = state.posMax;
  const oldPos = state.pos;
  state.pos = start + 1;
  level = 1;
  while (state.pos < max) {
    marker = state.src.charCodeAt(state.pos);
    if (marker === 93) {
      level--;
      if (level === 0) {
        found = true;
        break;
      }
    }
    prevPos = state.pos;
    state.md.inline.skipToken(state);
    if (marker === 91) {
      if (prevPos === state.pos - 1) level++;
      else if (disableNested) {
        state.pos = oldPos;
        return -1;
      }
    }
  }
  let labelEnd = -1;
  if (found) labelEnd = state.pos;
  state.pos = oldPos;
  return labelEnd;
}
function parseLinkDestination(str, start, max) {
  let code2;
  let pos = start;
  const result = {
    ok: false,
    pos: 0,
    str: ""
  };
  if (str.charCodeAt(pos) === 60) {
    pos++;
    while (pos < max) {
      code2 = str.charCodeAt(pos);
      if (code2 === 10) return result;
      if (code2 === 60) return result;
      if (code2 === 62) {
        result.pos = pos + 1;
        result.str = unescapeAll(str.slice(start + 1, pos));
        result.ok = true;
        return result;
      }
      if (code2 === 92 && pos + 1 < max) {
        pos += 2;
        continue;
      }
      pos++;
    }
    return result;
  }
  let level = 0;
  while (pos < max) {
    code2 = str.charCodeAt(pos);
    if (code2 === 32) break;
    if (code2 < 32 || code2 === 127) break;
    if (code2 === 92 && pos + 1 < max) {
      if (str.charCodeAt(pos + 1) === 32) {
        pos++;
        continue;
      }
      pos += 2;
      continue;
    }
    if (code2 === 40) {
      level++;
      if (level > 32) return result;
    }
    if (code2 === 41) {
      if (level === 0) break;
      level--;
    }
    pos++;
  }
  if (start === pos) return result;
  if (level !== 0) return result;
  result.str = unescapeAll(str.slice(start, pos));
  result.pos = pos;
  result.ok = true;
  return result;
}
function parseLinkTitle(str, start, max, prev_state) {
  let code2;
  let pos = start;
  const state = {
    ok: false,
    can_continue: false,
    pos: 0,
    str: "",
    marker: 0
  };
  if (prev_state) {
    state.str = prev_state.str;
    state.marker = prev_state.marker;
  } else {
    if (pos >= max) return state;
    let marker = str.charCodeAt(pos);
    if (marker !== 34 && marker !== 39 && marker !== 40) return state;
    start++;
    pos++;
    if (marker === 40) marker = 41;
    state.marker = marker;
  }
  while (pos < max) {
    code2 = str.charCodeAt(pos);
    if (code2 === state.marker) {
      state.pos = pos + 1;
      state.str += unescapeAll(str.slice(start, pos));
      state.ok = true;
      return state;
    } else if (code2 === 40 && state.marker === 41) return state;
    else if (code2 === 92 && pos + 1 < max) pos++;
    pos++;
  }
  state.can_continue = true;
  state.str += unescapeAll(str.slice(start, pos));
  return state;
}
var helpers_exports = /* @__PURE__ */ __exportAll({
  parseLinkDestination: () => parseLinkDestination,
  parseLinkLabel: () => parseLinkLabel,
  parseLinkTitle: () => parseLinkTitle
});
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
    return typeof o2;
  } : function(o2) {
    return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
  }, _typeof(o);
}
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
var Token = class {
  constructor(type, tag, nesting) {
    _defineProperty(
      this,
      /**
      * Source map info. Format: `[ line_begin, line_end ]`
      */
      "map",
      null
    );
    _defineProperty(
      this,
      /**
      * nesting level, the same as `state.level`
      */
      "level",
      0
    );
    _defineProperty(
      this,
      /**
      * An array of child nodes (inline and img tokens)
      */
      "children",
      null
    );
    _defineProperty(
      this,
      /**
      * In a case of self-closing tag (code, html, fence, etc.),
      * it has contents of this tag.
      */
      "content",
      ""
    );
    _defineProperty(
      this,
      /**
      * '*' or '_' for emphasis, fence string for fence, etc.
      */
      "markup",
      ""
    );
    _defineProperty(
      this,
      /**
      * Additional information:
      *
      * - Info string for "fence" tokens
      * - The value "auto" for autolink "link_open" and "link_close" tokens
      * - The string value of the item marker for ordered-list "list_item_open" tokens
      */
      "info",
      ""
    );
    _defineProperty(
      this,
      /**
      * True for block-level tokens, false for inline tokens.
      * Used in renderer to calculate line breaks
      */
      "block",
      false
    );
    _defineProperty(
      this,
      /**
      * If it's true, ignore this element when rendering. Used for tight lists
      * to hide paragraphs.
      */
      "hidden",
      false
    );
    this.type = type;
    this.tag = tag;
    this.attrs = null;
    this.nesting = nesting;
    this.meta = null;
  }
  /**
  * Search attribute index by name.
  */
  attrIndex(name) {
    if (!this.attrs) return -1;
    const attrs = this.attrs;
    for (let i = 0, len = attrs.length; i < len; i++) if (attrs[i][0] === name) return i;
    return -1;
  }
  /**
  * Add `[ name, value ]` attribute to list. Init attrs if necessary
  */
  attrPush(attrData) {
    if (this.attrs) this.attrs.push(attrData);
    else this.attrs = [attrData];
  }
  /**
  * Set `name` attribute to `value`. Override old value if exists.
  */
  attrSet(name, value) {
    const idx = this.attrIndex(name);
    const attrData = [name, value];
    if (idx < 0) this.attrPush(attrData);
    else this.attrs[idx] = attrData;
  }
  /**
  * Get the value of attribute `name`, or null if it does not exist.
  */
  attrGet(name) {
    const idx = this.attrIndex(name);
    let value = null;
    if (idx >= 0) value = this.attrs[idx][1];
    return value;
  }
  /**
  * Join value to existing attribute via space. Or create new attribute if not
  * exists. Useful to operate with token classes.
  */
  attrJoin(name, value) {
    const idx = this.attrIndex(name);
    if (idx < 0) this.attrPush([name, value]);
    else this.attrs[idx][1] = `${this.attrs[idx][1]} ${value}`;
  }
};
var Ruler = class {
  constructor() {
    _defineProperty(
      this,
      /** @internal */
      "__rules__",
      []
    );
    _defineProperty(
      this,
      /** @internal */
      "__cache__",
      null
    );
  }
  /** @internal */
  __find__(name) {
    for (let i = 0; i < this.__rules__.length; i++) if (this.__rules__[i].name === name) return i;
    return -1;
  }
  /** @internal */
  __compile__() {
    const chains = /* @__PURE__ */ new Set();
    this.__rules__.forEach((rule) => {
      if (!rule.enabled) return;
      rule.alt.forEach((altName) => {
        if (altName) chains.add(altName);
      });
    });
    this.__cache__ = /* @__PURE__ */ Object.create(null);
    this.__cache__[""] = [];
    this.__rules__.forEach((rule) => {
      if (rule.enabled) this.__cache__[""].push(rule.fn);
    });
    chains.forEach((chain) => {
      this.__cache__[chain] = [];
      this.__rules__.forEach((rule) => {
        if (rule.enabled && rule.alt.indexOf(chain) >= 0) this.__cache__[chain].push(rule.fn);
      });
    });
  }
  /**
  * Replace rule by name with new function & options. Throws error if name not
  * found.
  *
  * @example Replace existing typographer replacement rule with new one
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * md.core.ruler.at('replacements', function replace(state) {
  *   //...
  * });
  * ```
  */
  at(name, fn, options = {}) {
    const index = this.__find__(name);
    if (index === -1) throw new Error(`Parser rule not found: ${name}`);
    this.__rules__[index].fn = fn;
    this.__rules__[index].alt = options.alt || [];
    this.__cache__ = null;
  }
  /**
  * Add new rule to chain before one with given name. See also
  * {@link Ruler.after}, {@link Ruler.push}.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * md.block.ruler.before('paragraph', 'my_rule', function replace(state) {
  *   //...
  * });
  * ```
  */
  before(beforeName, ruleName, fn, options = {}) {
    const index = this.__find__(beforeName);
    if (index === -1) throw new Error(`Parser rule not found: ${beforeName}`);
    this.__rules__.splice(index, 0, {
      name: ruleName,
      enabled: true,
      fn,
      alt: options.alt || []
    });
    this.__cache__ = null;
  }
  /**
  * Add new rule to chain after one with given name. See also
  * {@link Ruler.before}, {@link Ruler.push}.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * md.inline.ruler.after('text', 'my_rule', function replace(state) {
  *   //...
  * });
  * ```
  */
  after(afterName, ruleName, fn, options = {}) {
    const index = this.__find__(afterName);
    if (index === -1) throw new Error(`Parser rule not found: ${afterName}`);
    this.__rules__.splice(index + 1, 0, {
      name: ruleName,
      enabled: true,
      fn,
      alt: options.alt || []
    });
    this.__cache__ = null;
  }
  /**
  * Push new rule to the end of chain. See also
  * {@link Ruler.before}, {@link Ruler.after}.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * md.core.ruler.push('my_rule', function replace(state) {
  *   //...
  * });
  * ```
  */
  push(ruleName, fn, options = {}) {
    this.__rules__.push({
      name: ruleName,
      enabled: true,
      fn,
      alt: options.alt || []
    });
    this.__cache__ = null;
  }
  /**
  * Enable rules with given names. If any rule name not found - throw Error.
  * Errors can be disabled by second param.
  *
  * See also {@link Ruler.disable}, {@link Ruler.enableOnly}.
  *
  * Returns list of found rule names (if no exception happened).
  */
  enable(list2, ignoreInvalid = false) {
    if (!Array.isArray(list2)) list2 = [list2];
    const result = [];
    list2.forEach((name) => {
      const idx = this.__find__(name);
      if (idx < 0) {
        if (ignoreInvalid) return;
        throw new Error(`Rules manager: invalid rule name ${name}`);
      }
      this.__rules__[idx].enabled = true;
      result.push(name);
    });
    this.__cache__ = null;
    return result;
  }
  /**
  * Enable rules with given names, and disable everything else. If any rule name
  * not found - throw Error. Errors can be disabled by second param.
  *
  * See also {@link Ruler.disable}, {@link Ruler.enable}.
  */
  enableOnly(list2, ignoreInvalid = false) {
    if (!Array.isArray(list2)) list2 = [list2];
    this.__rules__.forEach((rule) => {
      rule.enabled = false;
    });
    this.enable(list2, ignoreInvalid);
  }
  /**
  * Disable rules with given names. If any rule name not found - throw Error.
  * Errors can be disabled by second param.
  *
  * See also {@link Ruler.enable}, {@link Ruler.enableOnly}.
  *
  * Returns list of found rule names (if no exception happened).
  */
  disable(list2, ignoreInvalid = false) {
    if (!Array.isArray(list2)) list2 = [list2];
    const result = [];
    list2.forEach((name) => {
      const idx = this.__find__(name);
      if (idx < 0) {
        if (ignoreInvalid) return;
        throw new Error(`Rules manager: invalid rule name ${name}`);
      }
      this.__rules__[idx].enabled = false;
      result.push(name);
    });
    this.__cache__ = null;
    return result;
  }
  /**
  * Return array of active functions (rules) for given chain name. It analyzes
  * rules configuration, compiles caches if not exists and returns result.
  *
  * Default chain name is `''` (empty string). It can't be skipped. That's
  * done intentionally, to keep signature monomorphic for high speed.
  */
  getRules(chainName) {
    if (!this.__cache__) this.__compile__();
    return this.__cache__[chainName] || [];
  }
};
var default_rules = {};
default_rules.code_inline = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  return `<code${slf.renderAttrs(token)}>${escapeHtml(token.content)}</code>`;
};
default_rules.code_block = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  return `<pre${slf.renderAttrs(token)}><code>${escapeHtml(tokens[idx].content)}</code></pre>
`;
};
default_rules.fence = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  const info = token.info ? unescapeAll(token.info).trim() : "";
  let langName = "";
  let langAttrs = "";
  if (info) {
    const arr = info.split(/(\s+)/g);
    langName = arr[0];
    langAttrs = arr.slice(2).join("");
  }
  let highlighted;
  if (options.highlight) highlighted = options.highlight(token.content, langName, langAttrs) || escapeHtml(token.content);
  else highlighted = escapeHtml(token.content);
  if (highlighted.indexOf("<pre") === 0) return highlighted + "\n";
  if (info) {
    const i = token.attrIndex("class");
    const tmpAttrs = token.attrs ? token.attrs.slice() : [];
    if (i < 0) tmpAttrs.push(["class", `${options.langPrefix}${langName}`]);
    else {
      tmpAttrs[i] = [tmpAttrs[i][0], tmpAttrs[i][1]];
      tmpAttrs[i][1] += ` ${options.langPrefix}${langName}`;
    }
    const tmpToken = { attrs: tmpAttrs };
    return `<pre><code${slf.renderAttrs(tmpToken)}>${highlighted}</code></pre>
`;
  }
  return `<pre><code${slf.renderAttrs(token)}>${highlighted}</code></pre>
`;
};
default_rules.image = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  token.attrs[token.attrIndex("alt")][1] = slf.renderInlineAsText(token.children, options, env);
  return slf.renderToken(tokens, idx, options);
};
default_rules.hardbreak = function(tokens, idx, options) {
  return options.xhtmlOut ? "<br />\n" : "<br>\n";
};
default_rules.softbreak = function(tokens, idx, options) {
  return options.breaks ? options.xhtmlOut ? "<br />\n" : "<br>\n" : "\n";
};
default_rules.text = function(tokens, idx) {
  return escapeHtml(tokens[idx].content);
};
default_rules.html_block = function(tokens, idx) {
  return tokens[idx].content;
};
default_rules.html_inline = function(tokens, idx) {
  return tokens[idx].content;
};
var Renderer = class {
  constructor() {
    _defineProperty(
      this,
      /**
      * Contains render rules for tokens. Can be updated and extended.
      *
      * See [source code](https://github.com/markdown-it/markdown-it/blob/master/src/renderer.ts)
      * for more details and examples.
      *
      * @example Custom render rules
      * ```javascript
      * import MarkdownIt from 'markdown-it'
      * const md = new MarkdownIt()
      *
      * md.renderer.rules.strong_open  = function () { return '<b>'; };
      * md.renderer.rules.strong_close = function () { return '</b>'; };
      *
      * const result = md.renderInline(...);
      * ```
      *
      * @example Each rule is called as independent static function with fixed signature
      * ```javascript
      * function my_token_render(tokens, idx, options, env, renderer) {
      *   // ...
      *   return renderedHTML;
      * }
      * ```
      */
      "rules",
      Object.assign({}, default_rules)
    );
  }
  /**
  * Render token attributes to string.
  */
  renderAttrs(token) {
    let i, l, result;
    if (!token.attrs) return "";
    result = "";
    for (i = 0, l = token.attrs.length; i < l; i++) result += ` ${escapeHtml(token.attrs[i][0])}="${escapeHtml(String(token.attrs[i][1]))}"`;
    return result;
  }
  /**
  * Default token renderer. Can be overriden by custom function
  * in {@link Renderer.rules}.
  */
  renderToken(tokens, idx, options) {
    const token = tokens[idx];
    let result = "";
    if (token.hidden) return "";
    let prev = idx - 1;
    while (prev >= 0 && tokens[prev].hidden && tokens[prev].nesting === 0) prev--;
    if (token.block && token.nesting !== -1 && prev >= 0 && tokens[prev].hidden && tokens[prev].nesting === -1) result += "\n";
    result += (token.nesting === -1 ? "</" : "<") + token.tag;
    result += this.renderAttrs(token);
    if (token.nesting === 0 && options.xhtmlOut) result += " /";
    let needLf = false;
    if (token.block) {
      needLf = true;
      if (token.nesting === 1) {
        let next = idx + 1;
        while (next < tokens.length && tokens[next].hidden && tokens[next].nesting === 0) next++;
        if (next < tokens.length) {
          const nextToken = tokens[next];
          if (nextToken.type === "inline" || nextToken.hidden) needLf = false;
          else if (nextToken.nesting === -1 && nextToken.tag === token.tag) needLf = false;
        }
      }
    }
    result += needLf ? ">\n" : ">";
    return result;
  }
  /**
  * The same as {@link Renderer.render}, but for single token of `inline` type.
  */
  renderInline(tokens, options, env) {
    let result = "";
    const rules = this.rules;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const type = tokens[i].type;
      if (typeof rules[type] !== "undefined") result += rules[type](tokens, i, options, env, this);
      else result += this.renderToken(tokens, i, options);
    }
    return result;
  }
  /**
  * Special kludge for image `alt` attributes to conform CommonMark spec.
  * Don't try to use it! Spec requires to show `alt` content with stripped markup,
  * instead of simple escaping.
  */
  renderInlineAsText(tokens, options, env) {
    let result = "";
    for (let i = 0, len = tokens.length; i < len; i++) switch (tokens[i].type) {
      case "text":
      case "code_inline":
        result += tokens[i].content;
        break;
      case "image":
        result += this.renderInlineAsText(tokens[i].children, options, env);
        break;
      case "html_inline":
      case "html_block":
        result += tokens[i].content;
        break;
      case "softbreak":
      case "hardbreak":
        result += "\n";
    }
    return result;
  }
  /**
  * Takes token stream and generates HTML. Probably, you will never need to call
  * this method directly.
  */
  render(tokens, options, env) {
    let result = "";
    const rules = this.rules;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const type = tokens[i].type;
      if (type === "inline") result += this.renderInline(tokens[i].children, options, env);
      else if (typeof rules[type] !== "undefined") result += rules[type](tokens, i, options, env, this);
      else result += this.renderToken(tokens, i, options);
    }
    return result;
  }
};
var StateCore = class {
  constructor(src, md, env) {
    _defineProperty(this, "tokens", []);
    _defineProperty(this, "inlineMode", false);
    _defineProperty(this, "Token", Token);
    this.src = src;
    this.env = env;
    this.md = md;
  }
};
var UNNORMALIZED_NEWLINE_RE = /\r\n?/g;
var NULL_RE = /\0/g;
function normalize(state) {
  let str;
  str = state.src.replace(UNNORMALIZED_NEWLINE_RE, "\n");
  str = str.replace(NULL_RE, "\uFFFD");
  state.src = str;
}
function block(state) {
  let token;
  if (state.inlineMode) {
    token = new state.Token("inline", "", 0);
    token.content = state.src;
    token.map = [0, 1];
    token.children = [];
    state.tokens.push(token);
  } else state.md.block.parse(state.src, state.md, state.env, state.tokens);
}
function strip_references(state) {
  const tokens = state.tokens;
  let last = 0;
  for (let curr = 0; curr < tokens.length; curr++) {
    if (tokens[curr].type === "reference_definition") continue;
    if (curr !== last) tokens[last] = tokens[curr];
    last++;
  }
  if (tokens.length !== last) tokens.length = last;
}
function inline(state) {
  const tokens = state.tokens;
  for (let i = 0, l = tokens.length; i < l; i++) {
    const tok = tokens[i];
    if (tok.type === "inline") state.md.inline.parse(tok.content, state.md, state.env, tok.children);
  }
}
function isLinkOpen$1(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose$1(str) {
  return /^<\/a\s*>/i.test(str);
}
function linkify$1(state) {
  const blockTokens = state.tokens;
  if (!state.md.options.linkify) return;
  for (let j = 0, l = blockTokens.length; j < l; j++) {
    if (blockTokens[j].type !== "inline" || !state.md.linkify.test(blockTokens[j].content)) continue;
    const tokens = blockTokens[j].children;
    const replacements = [];
    let htmlLinkLevel = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const currentToken = tokens[i];
      if (currentToken.type === "link_close") {
        i--;
        while (tokens[i].level !== currentToken.level && tokens[i].type !== "link_open") i--;
        continue;
      }
      if (currentToken.type === "html_inline") {
        if (isLinkOpen$1(currentToken.content) && htmlLinkLevel > 0) htmlLinkLevel--;
        if (isLinkClose$1(currentToken.content)) htmlLinkLevel++;
      }
      if (htmlLinkLevel > 0) continue;
      if (currentToken.type === "text" && state.md.linkify.test(currentToken.content)) {
        const text2 = currentToken.content;
        let links = state.md.linkify.match(text2);
        const nodes = [];
        let level = currentToken.level;
        let lastPos = 0;
        if (links.length > 0 && links[0].index === 0 && i > 0 && tokens[i - 1].type === "text_special") links = links.slice(1);
        for (let ln = 0; ln < links.length; ln++) {
          const url = links[ln].url;
          const fullUrl = state.md.normalizeLink(url);
          if (!state.md.validateLink(fullUrl)) continue;
          let urlText = links[ln].text;
          if (!links[ln].schema) urlText = state.md.normalizeLinkText(`http://${urlText}`).replace(/^http:\/\//, "");
          else if (links[ln].schema === "mailto:" && !/^mailto:/i.test(urlText)) urlText = state.md.normalizeLinkText(`mailto:${urlText}`).replace(/^mailto:/, "");
          else urlText = state.md.normalizeLinkText(urlText);
          const pos = links[ln].index;
          if (pos > lastPos) {
            const token = new state.Token("text", "", 0);
            token.content = text2.slice(lastPos, pos);
            token.level = level;
            nodes.push(token);
          }
          const token_o = new state.Token("link_open", "a", 1);
          token_o.attrs = [["href", fullUrl]];
          token_o.level = level++;
          token_o.markup = "linkify";
          token_o.info = "auto";
          nodes.push(token_o);
          const token_t = new state.Token("text", "", 0);
          token_t.content = urlText;
          token_t.level = level;
          nodes.push(token_t);
          const token_c = new state.Token("link_close", "a", -1);
          token_c.level = --level;
          token_c.markup = "linkify";
          token_c.info = "auto";
          nodes.push(token_c);
          lastPos = links[ln].lastIndex;
        }
        if (lastPos < text2.length) {
          const token = new state.Token("text", "", 0);
          token.content = text2.slice(lastPos);
          token.level = level;
          nodes.push(token);
        }
        replacements.push({
          index: i,
          nodes
        });
      }
    }
    if (replacements.length > 0) {
      let newTokensLength = tokens.length;
      for (const replacement of replacements) newTokensLength += replacement.nodes.length - 1;
      const newTokens = new Array(newTokensLength);
      let replacementIndex = 0;
      let newTokenIndex = 0;
      replacements.reverse();
      for (let i = 0; i < tokens.length; i++) {
        const replacement = replacements[replacementIndex];
        if ((replacement === null || replacement === void 0 ? void 0 : replacement.index) === i) {
          for (const node of replacement.nodes) newTokens[newTokenIndex++] = node;
          replacementIndex++;
        } else newTokens[newTokenIndex++] = tokens[i];
      }
      blockTokens[j].children = newTokens;
    }
  }
}
var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;
var SCOPED_ABBR_TEST_RE = /\((c|tm|r)\)/i;
var SCOPED_ABBR_RE = /\((c|tm|r)\)/gi;
var SCOPED_ABBR = {
  c: "\xA9",
  r: "\xAE",
  tm: "\u2122"
};
function replaceFn(match, name) {
  return SCOPED_ABBR[name.toLowerCase()];
}
function replace_scoped(inlineTokens) {
  let inside_autolink = 0;
  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];
    if (token.type === "text" && !inside_autolink) token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
    if (token.type === "link_open" && token.info === "auto") inside_autolink--;
    if (token.type === "link_close" && token.info === "auto") inside_autolink++;
  }
}
function replace_rare(inlineTokens) {
  let inside_autolink = 0;
  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];
    if (token.type === "text" && !inside_autolink) {
      if (RARE_RE.test(token.content)) token.content = token.content.replace(/\+-/g, "\xB1").replace(/\.{2,}/g, "\u2026").replace(/([?!])…/g, "$1..").replace(/([?!]){4,}/g, "$1$1$1").replace(/,{2,}/g, ",").replace(/(^|[^-])---(?=[^-]|$)/gm, "$1\u2014").replace(/(^|\s)--(?=\s|$)/gm, "$1\u2013").replace(/(^|[^-\s])--(?=[^-\s]|$)/gm, "$1\u2013");
    }
    if (token.type === "link_open" && token.info === "auto") inside_autolink--;
    if (token.type === "link_close" && token.info === "auto") inside_autolink++;
  }
}
function replace(state) {
  let blkIdx;
  if (!state.md.options.typographer) return;
  for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline") continue;
    if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) replace_scoped(state.tokens[blkIdx].children);
    if (RARE_RE.test(state.tokens[blkIdx].content)) replace_rare(state.tokens[blkIdx].children);
  }
}
var QUOTE_TEST_RE = /['"]/;
var QUOTE_RE = /['"]/g;
var APOSTROPHE = "\u2019";
var MAX_OPENERS = 1e3;
function truncateStack(stack, heads, length) {
  while (stack.length > length) {
    const item = stack.pop();
    if (item.isSingleQuote) heads.single = item.prevSameQuoteIdx;
    else heads.double = item.prevSameQuoteIdx;
  }
}
function addReplacement(replacements, tokenIdx, pos, ch) {
  if (!replacements[tokenIdx]) replacements[tokenIdx] = [];
  replacements[tokenIdx].push({
    pos,
    ch
  });
}
function applyReplacements(str, replacements) {
  let result = "";
  let lastPos = 0;
  replacements.sort((a, b) => a.pos - b.pos);
  for (let i = 0; i < replacements.length; i++) {
    const replacement = replacements[i];
    result += str.slice(lastPos, replacement.pos) + replacement.ch;
    lastPos = replacement.pos + 1;
  }
  return result + str.slice(lastPos);
}
function process_inlines(tokens, state) {
  let j;
  const stack = [];
  const heads = {
    single: -1,
    double: -1
  };
  const replacements = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const thisLevel = tokens[i].level;
    for (j = stack.length - 1; j >= 0; j--) if (stack[j].level <= thisLevel) break;
    truncateStack(stack, heads, j + 1);
    if (token.type !== "text") continue;
    const text2 = token.content;
    let pos = 0;
    const max = text2.length;
    OUTER: while (pos < max) {
      QUOTE_RE.lastIndex = pos;
      const t = QUOTE_RE.exec(text2);
      if (!t) break;
      let canOpen = true;
      let canClose = true;
      pos = t.index + 1;
      const isSingle = t[0] === "'";
      let lastChar = 32;
      if (t.index - 1 >= 0) lastChar = text2.charCodeAt(t.index - 1);
      else for (j = i - 1; j >= 0; j--) {
        if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
        if (!tokens[j].content) continue;
        lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
        break;
      }
      let nextChar = 32;
      if (pos < max) nextChar = text2.charCodeAt(pos);
      else for (j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
        if (!tokens[j].content) continue;
        nextChar = tokens[j].content.charCodeAt(0);
        break;
      }
      const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctCharCode(lastChar);
      const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctCharCode(nextChar);
      const isLastWhiteSpace = isWhiteSpace(lastChar);
      const isNextWhiteSpace = isWhiteSpace(nextChar);
      if (isNextWhiteSpace) canOpen = false;
      else if (isNextPunctChar) {
        if (!(isLastWhiteSpace || isLastPunctChar)) canOpen = false;
      }
      if (isLastWhiteSpace) canClose = false;
      else if (isLastPunctChar) {
        if (!(isNextWhiteSpace || isNextPunctChar)) canClose = false;
      }
      if (nextChar === 34 && t[0] === '"') {
        if (lastChar >= 48 && lastChar <= 57) canClose = canOpen = false;
      }
      if (canOpen && canClose) {
        canOpen = isLastPunctChar;
        canClose = isNextPunctChar;
      }
      if (!canOpen && !canClose) {
        if (isSingle) addReplacement(replacements, i, t.index, APOSTROPHE);
        continue;
      }
      if (canClose) {
        j = isSingle ? heads.single : heads.double;
        if (j >= 0 && stack[j].level === thisLevel) {
          const item = stack[j];
          let openQuote;
          let closeQuote;
          if (isSingle) {
            openQuote = state.md.options.quotes[2];
            closeQuote = state.md.options.quotes[3];
          } else {
            openQuote = state.md.options.quotes[0];
            closeQuote = state.md.options.quotes[1];
          }
          addReplacement(replacements, i, t.index, closeQuote);
          addReplacement(replacements, item.tokenIdx, item.contentPos, openQuote);
          truncateStack(stack, heads, j);
          continue OUTER;
        }
      }
      if (canOpen) {
        if (stack.length >= MAX_OPENERS) return;
        stack.push({
          tokenIdx: i,
          contentPos: t.index,
          isSingleQuote: isSingle,
          level: thisLevel,
          prevSameQuoteIdx: isSingle ? heads.single : heads.double
        });
        if (isSingle) heads.single = stack.length - 1;
        else heads.double = stack.length - 1;
      } else if (canClose && isSingle) addReplacement(replacements, i, t.index, APOSTROPHE);
    }
  }
  Object.keys(replacements).forEach(function(tokenIdx) {
    const idx = Number(tokenIdx);
    tokens[idx].content = applyReplacements(tokens[idx].content, replacements[tokenIdx]);
  });
}
function smartquotes(state) {
  if (!state.md.options.typographer) return;
  for (let blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline" || !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) continue;
    process_inlines(state.tokens[blkIdx].children, state);
  }
}
function join_alt(tokens) {
  let curr, last;
  const max = tokens.length;
  for (curr = 0; curr < max; curr++) if (tokens[curr].type === "text_special") tokens[curr].type = "text";
  for (curr = last = 0; curr < max; curr++) if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
  else {
    if (curr !== last) tokens[last] = tokens[curr];
    last++;
  }
  if (curr !== last) tokens.length = last;
}
function text_join(state) {
  let curr, last;
  const blockTokens = state.tokens;
  const l = blockTokens.length;
  for (let j = 0; j < l; j++) {
    if (blockTokens[j].type !== "inline") continue;
    const tokens = blockTokens[j].children;
    const max = tokens.length;
    for (curr = 0; curr < max; curr++) {
      if (tokens[curr].type === "text_special") tokens[curr].type = "text";
      if (tokens[curr].children) join_alt(tokens[curr].children);
    }
    for (curr = last = 0; curr < max; curr++) if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
    else {
      if (curr !== last) tokens[last] = tokens[curr];
      last++;
    }
    if (curr !== last) tokens.length = last;
  }
}
var _rules$2 = [
  ["normalize", normalize],
  ["block", block],
  ["strip_references", strip_references],
  ["inline", inline],
  ["linkify", linkify$1],
  ["replacements", replace],
  ["smartquotes", smartquotes],
  ["text_join", text_join]
];
var ParserCore = class {
  constructor() {
    _defineProperty(
      this,
      /**
      * {@link Ruler} instance. Keep configuration of core rules.
      */
      "ruler",
      new Ruler()
    );
    _defineProperty(this, "State", StateCore);
    for (let i = 0; i < _rules$2.length; i++) this.ruler.push(_rules$2[i][0], _rules$2[i][1]);
  }
  /**
  * Executes core chain rules.
  */
  process(state) {
    const rules = this.ruler.getRules("");
    for (let i = 0, l = rules.length; i < l; i++) rules[i](state);
  }
};
var StateBlock = class {
  constructor(src, md, env, tokens) {
    _defineProperty(this, "bMarks", []);
    _defineProperty(this, "eMarks", []);
    _defineProperty(this, "tShift", []);
    _defineProperty(this, "sCount", []);
    _defineProperty(this, "bsCount", []);
    _defineProperty(this, "blkIndent", 0);
    _defineProperty(this, "line", 0);
    _defineProperty(this, "lineMax", 0);
    _defineProperty(this, "tight", false);
    _defineProperty(this, "listIndent", -1);
    _defineProperty(this, "parentType", "root");
    _defineProperty(this, "level", 0);
    _defineProperty(this, "Token", Token);
    this.src = src;
    this.md = md;
    this.env = env;
    this.tokens = tokens;
    const s = this.src;
    for (let start = 0, pos = 0, indent = 0, offset = 0, len = s.length, indent_found = false; pos < len; pos++) {
      const ch = s.charCodeAt(pos);
      if (!indent_found) if (isSpace(ch)) {
        indent++;
        if (ch === 9) offset += 4 - offset % 4;
        else offset++;
        continue;
      } else indent_found = true;
      if (ch === 10 || pos === len - 1) {
        if (ch !== 10) pos++;
        this.bMarks.push(start);
        this.eMarks.push(pos);
        this.tShift.push(indent);
        this.sCount.push(offset);
        this.bsCount.push(0);
        indent_found = false;
        indent = 0;
        offset = 0;
        start = pos + 1;
      }
    }
    this.bMarks.push(s.length);
    this.eMarks.push(s.length);
    this.tShift.push(0);
    this.sCount.push(0);
    this.bsCount.push(0);
    this.lineMax = this.bMarks.length - 1;
  }
  push(type, tag, nesting) {
    const token = new Token(type, tag, nesting);
    token.block = true;
    if (nesting < 0) this.level--;
    token.level = this.level;
    if (nesting > 0) this.level++;
    this.tokens.push(token);
    return token;
  }
  isEmpty(line) {
    return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
  }
  skipEmptyLines(from) {
    for (let max = this.lineMax; from < max; from++) if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) break;
    return from;
  }
  skipSpaces(pos) {
    for (let max = this.src.length; pos < max; pos++) if (!isSpace(this.src.charCodeAt(pos))) break;
    return pos;
  }
  skipSpacesBack(pos, min) {
    if (pos <= min) return pos;
    while (pos > min) if (!isSpace(this.src.charCodeAt(--pos))) return pos + 1;
    return pos;
  }
  skipChars(pos, code2) {
    for (let max = this.src.length; pos < max; pos++) if (this.src.charCodeAt(pos) !== code2) break;
    return pos;
  }
  skipCharsBack(pos, code2, min) {
    if (pos <= min) return pos;
    while (pos > min) if (code2 !== this.src.charCodeAt(--pos)) return pos + 1;
    return pos;
  }
  getLines(begin, end, indent, keepLastLF) {
    if (begin >= end) return "";
    const queue = new Array(end - begin);
    for (let i = 0, line = begin; line < end; line++, i++) {
      let lineIndent = 0;
      const lineStart = this.bMarks[line];
      let first = lineStart;
      let last;
      if (line + 1 < end || keepLastLF) last = this.eMarks[line] + 1;
      else last = this.eMarks[line];
      while (first < last && lineIndent < indent) {
        const ch = this.src.charCodeAt(first);
        if (isSpace(ch)) if (ch === 9) lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
        else lineIndent++;
        else if (first - lineStart < this.tShift[line]) lineIndent++;
        else break;
        first++;
      }
      if (lineIndent > indent) queue[i] = new Array(lineIndent - indent + 1).join(" ") + this.src.slice(first, last);
      else queue[i] = this.src.slice(first, last);
    }
    return queue.join("");
  }
};
var MAX_AUTOCOMPLETED_CELLS = 65536;
function getLine(state, line) {
  const pos = state.bMarks[line] + state.tShift[line];
  const max = state.eMarks[line];
  return state.src.slice(pos, max);
}
function escapedSplit(str) {
  const result = [];
  const max = str.length;
  let pos = 0;
  let ch = str.charCodeAt(pos);
  let isEscaped = false;
  let lastPos = 0;
  let current = "";
  while (pos < max) {
    if (ch === 124) if (!isEscaped) {
      result.push(current + str.substring(lastPos, pos));
      current = "";
      lastPos = pos + 1;
    } else {
      current += str.substring(lastPos, pos - 1);
      lastPos = pos;
    }
    isEscaped = ch === 92;
    pos++;
    ch = str.charCodeAt(pos);
  }
  result.push(current + str.substring(lastPos));
  return result;
}
function table(state, startLine, endLine, silent) {
  if (startLine + 2 > endLine) return false;
  let nextLine = startLine + 1;
  if (state.sCount[nextLine] < state.blkIndent) return false;
  if (state.sCount[nextLine] - state.blkIndent >= 4) return false;
  let pos = state.bMarks[nextLine] + state.tShift[nextLine];
  if (pos >= state.eMarks[nextLine]) return false;
  const firstCh = state.src.charCodeAt(pos++);
  if (firstCh !== 124 && firstCh !== 45 && firstCh !== 58) return false;
  if (pos >= state.eMarks[nextLine]) return false;
  const secondCh = state.src.charCodeAt(pos++);
  if (secondCh !== 124 && secondCh !== 45 && secondCh !== 58 && !isSpace(secondCh)) return false;
  if (firstCh === 45 && isSpace(secondCh)) return false;
  while (pos < state.eMarks[nextLine]) {
    const ch = state.src.charCodeAt(pos);
    if (ch !== 124 && ch !== 45 && ch !== 58 && !isSpace(ch)) return false;
    pos++;
  }
  let lineText = getLine(state, startLine + 1);
  let columns = lineText.split("|");
  const aligns = [];
  for (let i = 0; i < columns.length; i++) {
    const t = columns[i].trim();
    if (!t) if (i === 0 || i === columns.length - 1) continue;
    else return false;
    if (!/^:?-+:?$/.test(t)) return false;
    if (t.charCodeAt(t.length - 1) === 58) aligns.push(t.charCodeAt(0) === 58 ? "center" : "right");
    else if (t.charCodeAt(0) === 58) aligns.push("left");
    else aligns.push("");
  }
  lineText = getLine(state, startLine).trim();
  if (lineText.indexOf("|") === -1) return false;
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  columns = escapedSplit(lineText);
  if (columns.length && columns[0] === "") columns.shift();
  if (columns.length && columns[columns.length - 1] === "") columns.pop();
  const columnCount = columns.length;
  if (columnCount === 0 || columnCount !== aligns.length) return false;
  if (silent) return true;
  const oldParentType = state.parentType;
  state.parentType = "table";
  const terminatorRules = state.md.block.ruler.getRules("blockquote");
  const token_to = state.push("table_open", "table", 1);
  const tableLines = [startLine, 0];
  token_to.map = tableLines;
  const token_tho = state.push("thead_open", "thead", 1);
  token_tho.map = [startLine, startLine + 1];
  const token_htro = state.push("tr_open", "tr", 1);
  token_htro.map = [startLine, startLine + 1];
  for (let i = 0; i < columns.length; i++) {
    const token_ho = state.push("th_open", "th", 1);
    if (aligns[i]) token_ho.attrs = [["style", `text-align:${aligns[i]}`]];
    const token_il = state.push("inline", "", 0);
    token_il.content = columns[i].trim();
    token_il.children = [];
    state.push("th_close", "th", -1);
  }
  state.push("tr_close", "tr", -1);
  state.push("thead_close", "thead", -1);
  let tbodyLines;
  let autocompletedCells = 0;
  for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
    if (state.sCount[nextLine] < state.blkIndent) break;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) break;
    lineText = getLine(state, nextLine).trim();
    if (!lineText) break;
    if (state.sCount[nextLine] - state.blkIndent >= 4) break;
    columns = escapedSplit(lineText);
    if (columns.length && columns[0] === "") columns.shift();
    if (columns.length && columns[columns.length - 1] === "") columns.pop();
    autocompletedCells += columnCount - columns.length;
    if (autocompletedCells > MAX_AUTOCOMPLETED_CELLS) break;
    if (nextLine === startLine + 2) {
      const token_tbo = state.push("tbody_open", "tbody", 1);
      token_tbo.map = tbodyLines = [startLine + 2, 0];
    }
    const token_tro = state.push("tr_open", "tr", 1);
    token_tro.map = [nextLine, nextLine + 1];
    for (let i = 0; i < columnCount; i++) {
      const token_tdo = state.push("td_open", "td", 1);
      if (aligns[i]) token_tdo.attrs = [["style", `text-align:${aligns[i]}`]];
      const token_il = state.push("inline", "", 0);
      token_il.content = columns[i] ? columns[i].trim() : "";
      token_il.children = [];
      state.push("td_close", "td", -1);
    }
    state.push("tr_close", "tr", -1);
  }
  if (tbodyLines) {
    state.push("tbody_close", "tbody", -1);
    tbodyLines[1] = nextLine;
  }
  state.push("table_close", "table", -1);
  tableLines[1] = nextLine;
  state.parentType = oldParentType;
  state.line = nextLine;
  return true;
}
function code(state, startLine, endLine) {
  if (state.sCount[startLine] - state.blkIndent < 4) return false;
  let nextLine = startLine + 1;
  let last = nextLine;
  while (nextLine < endLine) {
    if (state.isEmpty(nextLine)) {
      nextLine++;
      continue;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      nextLine++;
      last = nextLine;
      continue;
    }
    break;
  }
  state.line = last;
  const token = state.push("code_block", "code", 0);
  token.content = state.getLines(startLine, last, 4 + state.blkIndent, false) + "\n";
  token.map = [startLine, state.line];
  return true;
}
function fence(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (pos + 3 > max) return false;
  const marker = state.src.charCodeAt(pos);
  if (marker !== 126 && marker !== 96) return false;
  let mem = pos;
  pos = state.skipChars(pos, marker);
  let len = pos - mem;
  if (len < 3) return false;
  const markup = state.src.slice(mem, pos);
  const params = state.src.slice(pos, max);
  if (marker === 96) {
    if (params.indexOf(String.fromCharCode(marker)) >= 0) return false;
  }
  if (silent) return true;
  let nextLine = startLine;
  let haveEndMarker = false;
  for (; ; ) {
    nextLine++;
    if (nextLine >= endLine) break;
    pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos < max && state.sCount[nextLine] < state.blkIndent) break;
    if (state.src.charCodeAt(pos) !== marker) continue;
    if (state.sCount[nextLine] - state.blkIndent >= 4) continue;
    pos = state.skipChars(pos, marker);
    if (pos - mem < len) continue;
    pos = state.skipSpaces(pos);
    if (pos < max) continue;
    haveEndMarker = true;
    break;
  }
  len = state.sCount[startLine];
  state.line = nextLine + (haveEndMarker ? 1 : 0);
  const token = state.push("fence", "code", 0);
  token.info = params;
  token.content = state.getLines(startLine + 1, nextLine, len, true);
  token.markup = markup;
  token.map = [startLine, state.line];
  return true;
}
function blockquote(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  const oldLineMax = state.lineMax;
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (state.src.charCodeAt(pos) !== 62) return false;
  if (silent) return true;
  const oldBMarks = [];
  const oldBSCount = [];
  const oldSCount = [];
  const oldTShift = [];
  const terminatorRules = state.md.block.ruler.getRules("blockquote");
  const oldParentType = state.parentType;
  state.parentType = "blockquote";
  let lastLineEmpty = false;
  let nextLine;
  for (nextLine = startLine; nextLine < endLine; nextLine++) {
    const isOutdented = state.sCount[nextLine] < state.blkIndent;
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos >= max) break;
    if (state.src.charCodeAt(pos++) === 62 && !isOutdented) {
      let initial = state.sCount[nextLine] + 1;
      let spaceAfterMarker;
      let adjustTab;
      if (state.src.charCodeAt(pos) === 32) {
        pos++;
        initial++;
        adjustTab = false;
        spaceAfterMarker = true;
      } else if (state.src.charCodeAt(pos) === 9) {
        spaceAfterMarker = true;
        if ((state.bsCount[nextLine] + initial) % 4 === 3) {
          pos++;
          initial++;
          adjustTab = false;
        } else adjustTab = true;
      } else spaceAfterMarker = false;
      let offset = initial;
      oldBMarks.push(state.bMarks[nextLine]);
      state.bMarks[nextLine] = pos;
      while (pos < max) {
        const ch = state.src.charCodeAt(pos);
        if (isSpace(ch)) if (ch === 9) offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
        else offset++;
        else break;
        pos++;
      }
      lastLineEmpty = pos >= max;
      oldBSCount.push(state.bsCount[nextLine]);
      state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
      oldSCount.push(state.sCount[nextLine]);
      state.sCount[nextLine] = offset - initial;
      oldTShift.push(state.tShift[nextLine]);
      state.tShift[nextLine] = pos - state.bMarks[nextLine];
      continue;
    }
    if (lastLineEmpty) break;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) {
      state.lineMax = nextLine;
      if (state.blkIndent !== 0) {
        oldBMarks.push(state.bMarks[nextLine]);
        oldBSCount.push(state.bsCount[nextLine]);
        oldTShift.push(state.tShift[nextLine]);
        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] -= state.blkIndent;
      }
      break;
    }
    oldBMarks.push(state.bMarks[nextLine]);
    oldBSCount.push(state.bsCount[nextLine]);
    oldTShift.push(state.tShift[nextLine]);
    oldSCount.push(state.sCount[nextLine]);
    state.sCount[nextLine] = -1;
  }
  const oldIndent = state.blkIndent;
  state.blkIndent = 0;
  const token_o = state.push("blockquote_open", "blockquote", 1);
  token_o.markup = ">";
  const lines = [startLine, 0];
  token_o.map = lines;
  state.md.block.tokenize(state, startLine, nextLine);
  const token_c = state.push("blockquote_close", "blockquote", -1);
  token_c.markup = ">";
  state.lineMax = oldLineMax;
  state.parentType = oldParentType;
  lines[1] = state.line;
  for (let i = 0; i < oldTShift.length; i++) {
    state.bMarks[i + startLine] = oldBMarks[i];
    state.tShift[i + startLine] = oldTShift[i];
    state.sCount[i + startLine] = oldSCount[i];
    state.bsCount[i + startLine] = oldBSCount[i];
  }
  state.blkIndent = oldIndent;
  return true;
}
function hr(state, startLine, endLine, silent) {
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 95) return false;
  let cnt = 1;
  while (pos < max) {
    const ch = state.src.charCodeAt(pos++);
    if (ch !== marker && !isSpace(ch)) return false;
    if (ch === marker) cnt++;
  }
  if (cnt < 3) return false;
  if (silent) return true;
  state.line = startLine + 1;
  const token = state.push("hr", "hr", 0);
  token.map = [startLine, state.line];
  token.markup = Array(cnt + 1).join(String.fromCharCode(marker));
  return true;
}
function skipBulletListMarker(state, startLine) {
  const max = state.eMarks[startLine];
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 43) return -1;
  if (pos < max) {
    if (!isSpace(state.src.charCodeAt(pos))) return -1;
  }
  return pos;
}
function skipOrderedListMarker(state, startLine) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  let pos = start;
  if (pos + 1 >= max) return -1;
  let ch = state.src.charCodeAt(pos++);
  if (ch < 48 || ch > 57) return -1;
  for (; ; ) {
    if (pos >= max) return -1;
    ch = state.src.charCodeAt(pos++);
    if (ch >= 48 && ch <= 57) {
      if (pos - start >= 10) return -1;
      continue;
    }
    if (ch === 41 || ch === 46) break;
    return -1;
  }
  if (pos < max) {
    ch = state.src.charCodeAt(pos);
    if (!isSpace(ch)) return -1;
  }
  return pos;
}
function markTightParagraphs(state, idx) {
  const level = state.level + 2;
  for (let i = idx + 2, l = state.tokens.length - 2; i < l; i++) if (state.tokens[i].level === level && state.tokens[i].type === "paragraph_open") {
    state.tokens[i + 2].hidden = true;
    state.tokens[i].hidden = true;
    i += 2;
  }
}
function list(state, startLine, endLine, silent) {
  let max, pos, start, token;
  let nextLine = startLine;
  let tight = true;
  if (state.sCount[nextLine] - state.blkIndent >= 4) return false;
  if (state.listIndent >= 0 && state.sCount[nextLine] - state.listIndent >= 4 && state.sCount[nextLine] < state.blkIndent) return false;
  let isTerminatingParagraph = false;
  if (silent && state.parentType === "paragraph") {
    if (state.sCount[nextLine] >= state.blkIndent) isTerminatingParagraph = true;
  }
  let isOrdered;
  let markerValue;
  let posAfterMarker;
  if ((posAfterMarker = skipOrderedListMarker(state, nextLine)) >= 0) {
    isOrdered = true;
    start = state.bMarks[nextLine] + state.tShift[nextLine];
    markerValue = Number(state.src.slice(start, posAfterMarker - 1));
    if (isTerminatingParagraph && markerValue !== 1) return false;
  } else if ((posAfterMarker = skipBulletListMarker(state, nextLine)) >= 0) isOrdered = false;
  else return false;
  if (isTerminatingParagraph) {
    if (state.skipSpaces(posAfterMarker) >= state.eMarks[nextLine]) return false;
  }
  if (silent) return true;
  const markerCharCode = state.src.charCodeAt(posAfterMarker - 1);
  const listTokIdx = state.tokens.length;
  if (isOrdered) {
    token = state.push("ordered_list_open", "ol", 1);
    if (markerValue !== 1) token.attrs = [["start", markerValue]];
  } else token = state.push("bullet_list_open", "ul", 1);
  const listLines = [nextLine, 0];
  token.map = listLines;
  token.markup = String.fromCharCode(markerCharCode);
  let prevEmptyEnd = false;
  const terminatorRules = state.md.block.ruler.getRules("list");
  const oldParentType = state.parentType;
  state.parentType = "list";
  while (nextLine < endLine) {
    pos = posAfterMarker;
    max = state.eMarks[nextLine];
    const initial = state.sCount[nextLine] + posAfterMarker - (state.bMarks[nextLine] + state.tShift[nextLine]);
    let offset = initial;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (ch === 9) offset += 4 - (offset + state.bsCount[nextLine]) % 4;
      else if (ch === 32) offset++;
      else break;
      pos++;
    }
    const contentStart = pos;
    let indentAfterMarker;
    if (contentStart >= max) indentAfterMarker = 1;
    else indentAfterMarker = offset - initial;
    if (indentAfterMarker > 4) indentAfterMarker = 1;
    const indent = initial + indentAfterMarker;
    token = state.push("list_item_open", "li", 1);
    token.markup = String.fromCharCode(markerCharCode);
    const itemLines = [nextLine, 0];
    token.map = itemLines;
    if (isOrdered) token.info = state.src.slice(start, posAfterMarker - 1);
    const oldTight = state.tight;
    const oldTShift = state.tShift[nextLine];
    const oldSCount = state.sCount[nextLine];
    const oldListIndent = state.listIndent;
    state.listIndent = state.blkIndent;
    state.blkIndent = indent;
    state.tight = true;
    state.tShift[nextLine] = contentStart - state.bMarks[nextLine];
    state.sCount[nextLine] = offset;
    if (contentStart >= max && state.isEmpty(nextLine + 1)) state.line = Math.min(state.line + 2, endLine);
    else state.md.block.tokenize(state, nextLine, endLine);
    if (!state.tight || prevEmptyEnd) tight = false;
    prevEmptyEnd = state.line - nextLine > 1 && state.isEmpty(state.line - 1);
    state.blkIndent = state.listIndent;
    state.listIndent = oldListIndent;
    state.tShift[nextLine] = oldTShift;
    state.sCount[nextLine] = oldSCount;
    state.tight = oldTight;
    token = state.push("list_item_close", "li", -1);
    token.markup = String.fromCharCode(markerCharCode);
    nextLine = state.line;
    itemLines[1] = nextLine;
    if (nextLine >= endLine) break;
    if (state.sCount[nextLine] < state.blkIndent) break;
    if (state.sCount[nextLine] - state.blkIndent >= 4) break;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) break;
    if (isOrdered) {
      posAfterMarker = skipOrderedListMarker(state, nextLine);
      if (posAfterMarker < 0) break;
      start = state.bMarks[nextLine] + state.tShift[nextLine];
    } else {
      posAfterMarker = skipBulletListMarker(state, nextLine);
      if (posAfterMarker < 0) break;
    }
    if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) break;
  }
  if (isOrdered) token = state.push("ordered_list_close", "ol", -1);
  else token = state.push("bullet_list_close", "ul", -1);
  token.markup = String.fromCharCode(markerCharCode);
  listLines[1] = nextLine;
  state.line = nextLine;
  state.parentType = oldParentType;
  if (tight) markTightParagraphs(state, listTokIdx);
  return true;
}
function reference(state, startLine, _endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  let nextLine = startLine + 1;
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (state.src.charCodeAt(pos) !== 91) return false;
  function getNextLine(nextLine2) {
    const endLine = state.lineMax;
    if (nextLine2 >= endLine || state.isEmpty(nextLine2)) return null;
    let isContinuation = false;
    if (state.sCount[nextLine2] - state.blkIndent > 3) isContinuation = true;
    if (state.sCount[nextLine2] < 0) isContinuation = true;
    if (!isContinuation) {
      const terminatorRules = state.md.block.ruler.getRules("reference");
      const oldParentType = state.parentType;
      state.parentType = "reference";
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine2, endLine, true)) {
        terminate = true;
        break;
      }
      state.parentType = oldParentType;
      if (terminate) return null;
    }
    const pos2 = state.bMarks[nextLine2] + state.tShift[nextLine2];
    const max2 = state.eMarks[nextLine2];
    return state.src.slice(pos2, max2 + 1);
  }
  let str = state.src.slice(pos, max + 1);
  max = str.length;
  let labelEnd = -1;
  for (pos = 1; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 91) return false;
    else if (ch === 93) {
      labelEnd = pos;
      break;
    } else if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (ch === 92) {
      pos++;
      if (pos < max && str.charCodeAt(pos) === 10) {
        const lineContent = getNextLine(nextLine);
        if (lineContent !== null) {
          str += lineContent;
          max = str.length;
          nextLine++;
        }
      }
    }
  }
  if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58) return false;
  for (pos = labelEnd + 2; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (isSpace(ch)) {
    } else break;
  }
  const destRes = state.md.helpers.parseLinkDestination(str, pos, max);
  if (!destRes.ok) return false;
  const href = state.md.normalizeLink(destRes.str);
  if (!state.md.validateLink(href)) return false;
  pos = destRes.pos;
  const destEndPos = pos;
  const destEndLineNo = nextLine;
  const start = pos;
  for (; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (isSpace(ch)) {
    } else break;
  }
  let titleRes = state.md.helpers.parseLinkTitle(str, pos, max);
  while (titleRes.can_continue) {
    const lineContent = getNextLine(nextLine);
    if (lineContent === null) break;
    str += lineContent;
    pos = max;
    max = str.length;
    nextLine++;
    titleRes = state.md.helpers.parseLinkTitle(str, pos, max, titleRes);
  }
  let title;
  if (pos < max && start !== pos && titleRes.ok) {
    title = titleRes.str;
    pos = titleRes.pos;
  } else {
    title = "";
    pos = destEndPos;
    nextLine = destEndLineNo;
  }
  while (pos < max) {
    if (!isSpace(str.charCodeAt(pos))) break;
    pos++;
  }
  if (pos < max && str.charCodeAt(pos) !== 10) {
    if (title) {
      title = "";
      pos = destEndPos;
      nextLine = destEndLineNo;
      while (pos < max) {
        if (!isSpace(str.charCodeAt(pos))) break;
        pos++;
      }
    }
  }
  if (pos < max && str.charCodeAt(pos) !== 10) return false;
  const label2 = normalizeReference(str.slice(1, labelEnd));
  if (!label2) return false;
  if (silent) return true;
  if (typeof state.env.references === "undefined") state.env.references = {};
  if (typeof state.env.references[label2] === "undefined") state.env.references[label2] = {
    title,
    href
  };
  const token = state.push("reference_definition", "", 0);
  token.map = [startLine, nextLine];
  token.hidden = true;
  const meta = /* @__PURE__ */ Object.create(null);
  meta.label = label2;
  token.meta = meta;
  state.line = nextLine;
  return true;
}
var html_blocks_default = [
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul"
];
var open_tag = `<[A-Za-z][A-Za-z0-9\\-]*(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"'=<>\`\\x00-\\x20]+|'[^']*'|"[^"]*"))?)*\\s*\\/?>`;
var close_tag = "<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>";
var HTML_TAG_RE = new RegExp(`^(?:${open_tag}|${close_tag}|<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->|<[?][\\s\\S]*?[?]>|<![A-Za-z][^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)`);
var HTML_OPEN_CLOSE_TAG_RE = new RegExp(`^(?:${open_tag}|${close_tag})`);
var HTML_SEQUENCES = [
  [
    /^<(script|pre|style|textarea)(?=(\s|>|$))/i,
    /<\/(script|pre|style|textarea)>/i,
    true
  ],
  [
    /^<!--/,
    /-->/,
    true
  ],
  [
    /^<\?/,
    /\?>/,
    true
  ],
  [
    /^<![A-Za-z]/,
    />/,
    true
  ],
  [
    /^<!\[CDATA\[/,
    /\]\]>/,
    true
  ],
  [
    new RegExp(`^</?(${html_blocks_default.join("|")})(?=(\\s|/?>|$))`, "i"),
    /^$/,
    true
  ],
  [
    new RegExp(`${HTML_OPEN_CLOSE_TAG_RE.source}\\s*$`),
    /^$/,
    false
  ]
];
function html_block(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (!state.md.options.html) return false;
  if (state.src.charCodeAt(pos) !== 60) return false;
  let lineText = state.src.slice(pos, max);
  let i = 0;
  for (; i < HTML_SEQUENCES.length; i++) if (HTML_SEQUENCES[i][0].test(lineText)) break;
  if (i === HTML_SEQUENCES.length) return false;
  if (silent) return HTML_SEQUENCES[i][2];
  let nextLine = startLine + 1;
  const endsOnBlankLine = HTML_SEQUENCES[i][1].test("");
  if (!HTML_SEQUENCES[i][1].test(lineText)) for (; nextLine < endLine; nextLine++) {
    if (state.sCount[nextLine] < state.blkIndent) {
      if (endsOnBlankLine || !state.isEmpty(nextLine)) break;
    }
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    lineText = state.src.slice(pos, max);
    if (HTML_SEQUENCES[i][1].test(lineText)) {
      if (lineText.length !== 0) nextLine++;
      break;
    }
  }
  state.line = nextLine;
  const token = state.push("html_block", "", 0);
  token.map = [startLine, nextLine];
  token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
  return true;
}
function heading(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  let ch = state.src.charCodeAt(pos);
  if (ch !== 35 || pos >= max) return false;
  let level = 1;
  ch = state.src.charCodeAt(++pos);
  while (ch === 35 && pos < max && level <= 6) {
    level++;
    ch = state.src.charCodeAt(++pos);
  }
  if (level > 6 || pos < max && !isSpace(ch)) return false;
  if (silent) return true;
  max = state.skipSpacesBack(max, pos);
  const tmp = state.skipCharsBack(max, 35, pos);
  if (tmp > pos && isSpace(state.src.charCodeAt(tmp - 1))) max = tmp;
  state.line = startLine + 1;
  const token_o = state.push("heading_open", `h${level}`, 1);
  token_o.markup = "########".slice(0, level);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = asciiTrim(state.src.slice(pos, max));
  token_i.map = [startLine, state.line];
  token_i.children = [];
  const token_c = state.push("heading_close", `h${level}`, -1);
  token_c.markup = "########".slice(0, level);
  return true;
}
function lheading(state, startLine, endLine) {
  const terminatorRules = state.md.block.ruler.getRules("paragraph");
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const oldParentType = state.parentType;
  state.parentType = "paragraph";
  let level = 0;
  let marker;
  let nextLine = startLine + 1;
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    if (state.sCount[nextLine] - state.blkIndent > 3) continue;
    if (state.sCount[nextLine] >= state.blkIndent) {
      let pos = state.bMarks[nextLine] + state.tShift[nextLine];
      const max = state.eMarks[nextLine];
      if (pos < max) {
        marker = state.src.charCodeAt(pos);
        if (marker === 45 || marker === 61) {
          pos = state.skipChars(pos, marker);
          pos = state.skipSpaces(pos);
          if (pos >= max) {
            level = marker === 61 ? 1 : 2;
            break;
          }
        }
      }
    }
    if (state.sCount[nextLine] < 0) continue;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) break;
  }
  if (!level) {
    state.parentType = oldParentType;
    return false;
  }
  const content = asciiTrim(state.getLines(startLine, nextLine, state.blkIndent, false));
  state.line = nextLine + 1;
  const token_o = state.push("heading_open", `h${level}`, 1);
  token_o.markup = String.fromCharCode(marker);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = content;
  token_i.map = [startLine, state.line - 1];
  token_i.children = [];
  const token_c = state.push("heading_close", `h${level}`, -1);
  token_c.markup = String.fromCharCode(marker);
  state.parentType = oldParentType;
  return true;
}
function paragraph(state, startLine, endLine) {
  const terminatorRules = state.md.block.ruler.getRules("paragraph");
  const oldParentType = state.parentType;
  let nextLine = startLine + 1;
  state.parentType = "paragraph";
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    if (state.sCount[nextLine] - state.blkIndent > 3) continue;
    if (state.sCount[nextLine] < 0) continue;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) break;
  }
  const content = asciiTrim(state.getLines(startLine, nextLine, state.blkIndent, false));
  state.line = nextLine;
  const token_o = state.push("paragraph_open", "p", 1);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = content;
  token_i.map = [startLine, state.line];
  token_i.children = [];
  state.push("paragraph_close", "p", -1);
  state.parentType = oldParentType;
  return true;
}
var _rules$1 = [
  [
    "table",
    table,
    ["paragraph", "reference"]
  ],
  ["code", code],
  [
    "fence",
    fence,
    [
      "paragraph",
      "reference",
      "blockquote",
      "list"
    ]
  ],
  [
    "blockquote",
    blockquote,
    [
      "paragraph",
      "reference",
      "blockquote",
      "list"
    ]
  ],
  [
    "hr",
    hr,
    [
      "paragraph",
      "reference",
      "blockquote",
      "list"
    ]
  ],
  [
    "list",
    list,
    [
      "paragraph",
      "reference",
      "blockquote"
    ]
  ],
  ["reference", reference],
  [
    "html_block",
    html_block,
    [
      "paragraph",
      "reference",
      "blockquote"
    ]
  ],
  [
    "heading",
    heading,
    [
      "paragraph",
      "reference",
      "blockquote"
    ]
  ],
  ["lheading", lheading],
  ["paragraph", paragraph]
];
var ParserBlock = class {
  constructor() {
    _defineProperty(
      this,
      /**
      * {@link Ruler} instance. Keep configuration of block rules.
      */
      "ruler",
      new Ruler()
    );
    _defineProperty(this, "State", StateBlock);
    for (let i = 0; i < _rules$1.length; i++) this.ruler.push(_rules$1[i][0], _rules$1[i][1], { alt: (_rules$1[i][2] || []).slice() });
  }
  tokenize(state, startLine, endLine) {
    const rules = this.ruler.getRules("");
    const len = rules.length;
    const maxNesting = state.md.options.maxNesting;
    let line = startLine;
    let hasEmptyLines = false;
    while (line < endLine) {
      state.line = line = state.skipEmptyLines(line);
      if (line >= endLine) break;
      if (state.sCount[line] < state.blkIndent) break;
      if (state.level >= maxNesting) {
        state.line = endLine;
        break;
      }
      const prevLine = state.line;
      let ok = false;
      for (let i = 0; i < len; i++) {
        ok = rules[i](state, line, endLine, false);
        if (ok) {
          if (prevLine >= state.line) throw new Error("block rule didn't increment state.line");
          break;
        }
      }
      if (!ok) throw new Error("none of the block rules matched");
      state.tight = !hasEmptyLines;
      if (state.isEmpty(state.line - 1)) hasEmptyLines = true;
      line = state.line;
      if (line < endLine && state.isEmpty(line)) {
        hasEmptyLines = true;
        line++;
        state.line = line;
      }
    }
  }
  /**
  * Process input string and push block tokens into `outTokens`
  */
  parse(src, md, env, outTokens) {
    if (!src) return;
    const state = new this.State(src, md, env, outTokens);
    this.tokenize(state, state.line, state.lineMax);
  }
};
var StateInline = class {
  constructor(src, md, env, outTokens) {
    _defineProperty(this, "pos", 0);
    _defineProperty(this, "level", 0);
    _defineProperty(this, "pending", "");
    _defineProperty(this, "pendingLevel", 0);
    _defineProperty(this, "cache", {});
    _defineProperty(this, "backticks", {});
    _defineProperty(this, "backticksScanned", false);
    _defineProperty(this, "linkLevel", 0);
    _defineProperty(this, "delimiters", []);
    _defineProperty(this, "_prev_delimiters", []);
    _defineProperty(this, "Token", Token);
    this.src = src;
    this.env = env;
    this.md = md;
    this.tokens = outTokens;
    this.tokens_meta = Array(outTokens.length);
    this.posMax = this.src.length;
  }
  pushPending() {
    const token = new Token("text", "", 0);
    token.content = this.pending;
    token.level = this.pendingLevel;
    this.tokens.push(token);
    this.pending = "";
    return token;
  }
  push(type, tag, nesting) {
    if (this.pending) this.pushPending();
    const token = new Token(type, tag, nesting);
    let token_meta = void 0;
    if (nesting < 0) {
      this.level--;
      this.delimiters = this._prev_delimiters.pop();
    }
    token.level = this.level;
    if (nesting > 0) {
      this.level++;
      this._prev_delimiters.push(this.delimiters);
      this.delimiters = [];
      token_meta = { delimiters: this.delimiters };
    }
    this.pendingLevel = this.level;
    this.tokens.push(token);
    this.tokens_meta.push(token_meta);
    return token;
  }
  scanDelims(start, canSplitWord) {
    const max = this.posMax;
    const marker = this.src.charCodeAt(start);
    let lastChar;
    if (start === 0) lastChar = 32;
    else if (start === 1) {
      lastChar = this.src.charCodeAt(0);
      if ((lastChar & 63488) === 55296) lastChar = 65533;
    } else {
      lastChar = this.src.charCodeAt(start - 1);
      if ((lastChar & 64512) === 56320) {
        const highSurr = this.src.charCodeAt(start - 2);
        lastChar = (highSurr & 64512) === 55296 ? 65536 + (highSurr - 55296 << 10) + (lastChar - 56320) : 65533;
      } else if ((lastChar & 64512) === 55296) lastChar = 65533;
    }
    let pos = start;
    while (pos < max && this.src.charCodeAt(pos) === marker) pos++;
    const count = pos - start;
    let nextChar = pos < max ? this.src.charCodeAt(pos) : 32;
    if ((nextChar & 64512) === 55296) {
      const lowSurr = this.src.charCodeAt(pos + 1);
      nextChar = (lowSurr & 64512) === 56320 ? 65536 + (nextChar - 55296 << 10) + (lowSurr - 56320) : 65533;
    } else if ((nextChar & 64512) === 56320) nextChar = 65533;
    const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctCharCode(lastChar);
    const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctCharCode(nextChar);
    const isLastWhiteSpace = isWhiteSpace(lastChar);
    const isNextWhiteSpace = isWhiteSpace(nextChar);
    const left_flanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
    const right_flanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);
    return {
      can_open: left_flanking && (canSplitWord || !right_flanking || isLastPunctChar),
      can_close: right_flanking && (canSplitWord || !left_flanking || isNextPunctChar),
      length: count
    };
  }
};
function isTerminatorChar(ch) {
  switch (ch) {
    case 10:
    case 33:
    case 35:
    case 36:
    case 37:
    case 38:
    case 42:
    case 43:
    case 45:
    case 58:
    case 60:
    case 61:
    case 62:
    case 64:
    case 91:
    case 92:
    case 93:
    case 94:
    case 95:
    case 96:
    case 123:
    case 125:
    case 126:
      return true;
    default:
      return false;
  }
}
function text(state, silent) {
  let pos = state.pos;
  while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) pos++;
  if (pos === state.pos) return false;
  if (!silent) state.pending += state.src.slice(state.pos, pos);
  state.pos = pos;
  return true;
}
function isAsciiAlpha(code2) {
  return code2 >= 65 && code2 <= 90 || code2 >= 97 && code2 <= 122;
}
function isSchemeChar(code2) {
  return code2 >= 65 && code2 <= 90 || code2 >= 97 && code2 <= 122 || code2 >= 48 && code2 <= 57 || code2 === 43 || code2 === 45 || code2 === 46;
}
function linkify(state, silent) {
  if (!state.md.options.linkify) return false;
  if (state.linkLevel > 0) return false;
  const pos = state.pos;
  const max = state.posMax;
  if (pos + 3 > max) return false;
  if (state.src.charCodeAt(pos) !== 58) return false;
  if (state.src.charCodeAt(pos + 1) !== 47) return false;
  if (state.src.charCodeAt(pos + 2) !== 47) return false;
  const protoMin = pos - Math.min(10, state.pending.length, pos);
  let protoStart = pos;
  while (protoStart > protoMin && isSchemeChar(state.src.charCodeAt(protoStart - 1))) protoStart--;
  if (protoStart === pos || !isAsciiAlpha(state.src.charCodeAt(protoStart))) return false;
  const protoLength = pos - protoStart;
  const link2 = state.md.linkify.matchAtStart(state.src.slice(protoStart));
  if (!link2) return false;
  let url = link2.url;
  if (url.length <= protoLength) return false;
  let urlEnd = url.length;
  while (urlEnd > 0 && url.charCodeAt(urlEnd - 1) === 42) urlEnd--;
  if (urlEnd !== url.length) url = url.slice(0, urlEnd);
  const fullUrl = state.md.normalizeLink(url);
  if (!state.md.validateLink(fullUrl)) return false;
  if (!silent) {
    state.pending = state.pending.slice(0, -protoLength);
    const token_o = state.push("link_open", "a", 1);
    token_o.attrs = [["href", fullUrl]];
    token_o.markup = "linkify";
    token_o.info = "auto";
    const token_t = state.push("text", "", 0);
    token_t.content = state.md.normalizeLinkText(url);
    const token_c = state.push("link_close", "a", -1);
    token_c.markup = "linkify";
    token_c.info = "auto";
  }
  state.pos += url.length - protoLength;
  return true;
}
function newline(state, silent) {
  let pos = state.pos;
  if (state.src.charCodeAt(pos) !== 10) return false;
  const pmax = state.pending.length - 1;
  const max = state.posMax;
  if (!silent) if (pmax >= 0 && state.pending.charCodeAt(pmax) === 32) if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 32) {
    let ws = pmax - 1;
    while (ws >= 1 && state.pending.charCodeAt(ws - 1) === 32) ws--;
    state.pending = state.pending.slice(0, ws);
    state.push("hardbreak", "br", 0);
  } else {
    state.pending = state.pending.slice(0, -1);
    state.push("softbreak", "br", 0);
  }
  else state.push("softbreak", "br", 0);
  pos++;
  while (pos < max && isSpace(state.src.charCodeAt(pos))) pos++;
  state.pos = pos;
  return true;
}
var ESCAPED = [];
for (let i = 0; i < 256; i++) ESCAPED.push(0);
"\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-".split("").forEach(function(ch) {
  ESCAPED[ch.charCodeAt(0)] = 1;
});
function escape(state, silent) {
  let pos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(pos) !== 92) return false;
  pos++;
  if (pos >= max) return false;
  let ch1 = state.src.charCodeAt(pos);
  if (ch1 === 10) {
    if (!silent) state.push("hardbreak", "br", 0);
    pos++;
    while (pos < max) {
      ch1 = state.src.charCodeAt(pos);
      if (!isSpace(ch1)) break;
      pos++;
    }
    state.pos = pos;
    return true;
  }
  if (ch1 === 32) {
    if (!silent) {
      const token = state.push("text_special", "", 0);
      token.content = "\\";
      token.markup = "\\";
      token.info = "escape";
    }
    state.pos = pos;
    return true;
  }
  let escapedStr = state.src[pos];
  if (ch1 >= 55296 && ch1 <= 56319 && pos + 1 < max) {
    const ch2 = state.src.charCodeAt(pos + 1);
    if (ch2 >= 56320 && ch2 <= 57343) {
      escapedStr += state.src[pos + 1];
      pos++;
    }
  }
  const origStr = "\\" + escapedStr;
  if (!silent) {
    const token = state.push("text_special", "", 0);
    if (ch1 < 256 && ESCAPED[ch1] !== 0) token.content = escapedStr;
    else token.content = origStr;
    token.markup = origStr;
    token.info = "escape";
  }
  state.pos = pos + 1;
  return true;
}
function buildLastRuns(src) {
  const lastRuns = {};
  let pos = 0;
  while ((pos = src.indexOf("`", pos)) !== -1) {
    const start = pos;
    while (src.charCodeAt(++pos) === 96) ;
    lastRuns[pos - start] = start;
  }
  return lastRuns;
}
function backtick(state, silent) {
  var _state$backticks$open;
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 96) return false;
  const max = state.posMax;
  let pos = start + 1;
  while (pos < max && state.src.charCodeAt(pos) === 96) pos++;
  const marker = state.src.slice(start, pos);
  const openerLength = marker.length;
  if (!state.backticksScanned) {
    state.backticks = buildLastRuns(state.src);
    state.backticksScanned = true;
  }
  if (((_state$backticks$open = state.backticks[openerLength]) !== null && _state$backticks$open !== void 0 ? _state$backticks$open : -1) >= pos) {
    let matchEnd = pos;
    let matchStart;
    while ((matchStart = state.src.indexOf("`", matchEnd)) !== -1 && matchStart < max) {
      matchEnd = matchStart + 1;
      while (state.src.charCodeAt(matchEnd) === 96) matchEnd++;
      if (matchEnd > max) break;
      if (matchEnd - matchStart === openerLength) {
        if (!silent) {
          const token = state.push("code_inline", "code", 0);
          token.markup = marker;
          let content = state.src.slice(pos, matchStart).replace(/\n/g, " ");
          if (content.startsWith(" ") && content.endsWith(" ") && /[^ ]/.test(content)) content = content.slice(1, -1);
          token.content = content;
        }
        state.pos = matchEnd;
        return true;
      }
    }
  }
  if (!silent) state.pending += marker;
  state.pos = pos;
  return true;
}
function strikethrough_tokenize(state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);
  if (silent) return false;
  if (marker !== 126) return false;
  const scanned = state.scanDelims(state.pos, true);
  let len = scanned.length;
  const ch = String.fromCharCode(marker);
  if (len < 2) return false;
  let token;
  if (len % 2) {
    token = state.push("text", "", 0);
    token.content = ch;
    len--;
  }
  for (let i = 0; i < len; i += 2) {
    token = state.push("text", "", 0);
    token.content = ch + ch;
    state.delimiters.push({
      marker,
      length: 0,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close
    });
  }
  state.pos += scanned.length;
  return true;
}
function postProcess$1(state, delimiters2) {
  let token;
  const loneMarkers = [];
  const max = delimiters2.length;
  for (let i = 0; i < max; i++) {
    const startDelim = delimiters2[i];
    if (startDelim.marker !== 126) continue;
    if (startDelim.end === -1) continue;
    const endDelim = delimiters2[startDelim.end];
    token = state.tokens[startDelim.token];
    token.type = "s_open";
    token.tag = "s";
    token.nesting = 1;
    token.markup = "~~";
    token.content = "";
    token = state.tokens[endDelim.token];
    token.type = "s_close";
    token.tag = "s";
    token.nesting = -1;
    token.markup = "~~";
    token.content = "";
    if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "~") loneMarkers.push(endDelim.token - 1);
  }
  while (loneMarkers.length) {
    const i = loneMarkers.pop();
    let j = i + 1;
    while (j < state.tokens.length && state.tokens[j].type === "s_close") j++;
    j--;
    if (i !== j) {
      token = state.tokens[j];
      state.tokens[j] = state.tokens[i];
      state.tokens[i] = token;
    }
  }
}
function strikethrough_postProcess(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  postProcess$1(state, state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    var _tokens_meta$curr;
    const delimiters2 = (_tokens_meta$curr = tokens_meta[curr]) === null || _tokens_meta$curr === void 0 ? void 0 : _tokens_meta$curr.delimiters;
    if (delimiters2) postProcess$1(state, delimiters2);
  }
}
var strikethrough_default = {
  tokenize: strikethrough_tokenize,
  postProcess: strikethrough_postProcess
};
function emphasis_tokenize(state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);
  if (silent) return false;
  if (marker !== 95 && marker !== 42) return false;
  const scanned = state.scanDelims(state.pos, marker === 42);
  for (let i = 0; i < scanned.length; i++) {
    const token = state.push("text", "", 0);
    token.content = String.fromCharCode(marker);
    state.delimiters.push({
      marker,
      length: scanned.length,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close
    });
  }
  state.pos += scanned.length;
  return true;
}
function postProcess(state, delimiters2) {
  const max = delimiters2.length;
  for (let i = max - 1; i >= 0; i--) {
    const startDelim = delimiters2[i];
    if (startDelim.marker !== 95 && startDelim.marker !== 42) continue;
    if (startDelim.end === -1) continue;
    const endDelim = delimiters2[startDelim.end];
    const isStrong = i > 0 && delimiters2[i - 1].end === startDelim.end + 1 && delimiters2[i - 1].marker === startDelim.marker && delimiters2[i - 1].token === startDelim.token - 1 && delimiters2[startDelim.end + 1].token === endDelim.token + 1;
    const ch = String.fromCharCode(startDelim.marker);
    const token_o = state.tokens[startDelim.token];
    token_o.type = isStrong ? "strong_open" : "em_open";
    token_o.tag = isStrong ? "strong" : "em";
    token_o.nesting = 1;
    token_o.markup = isStrong ? ch + ch : ch;
    token_o.content = "";
    const token_c = state.tokens[endDelim.token];
    token_c.type = isStrong ? "strong_close" : "em_close";
    token_c.tag = isStrong ? "strong" : "em";
    token_c.nesting = -1;
    token_c.markup = isStrong ? ch + ch : ch;
    token_c.content = "";
    if (isStrong) {
      state.tokens[delimiters2[i - 1].token].content = "";
      state.tokens[delimiters2[startDelim.end + 1].token].content = "";
      i--;
    }
  }
}
function emphasis_post_process(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  postProcess(state, state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    var _tokens_meta$curr;
    const delimiters2 = (_tokens_meta$curr = tokens_meta[curr]) === null || _tokens_meta$curr === void 0 ? void 0 : _tokens_meta$curr.delimiters;
    if (delimiters2) postProcess(state, delimiters2);
  }
}
var emphasis_default = {
  tokenize: emphasis_tokenize,
  postProcess: emphasis_post_process
};
function link(state, silent) {
  let code2, label2, res, ref;
  let href = "";
  let title = "";
  let start = state.pos;
  let parseReference = true;
  if (state.src.charCodeAt(state.pos) !== 91) return false;
  const oldPos = state.pos;
  const max = state.posMax;
  const labelStart = state.pos + 1;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
  if (labelEnd < 0) return false;
  let pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 40) {
    parseReference = false;
    pos++;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (!isSpace(code2) && code2 !== 10) break;
    }
    if (pos >= max) return false;
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) pos = res.pos;
      else href = "";
      start = pos;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (!isSpace(code2) && code2 !== 10) break;
      }
      res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
        for (; pos < max; pos++) {
          code2 = state.src.charCodeAt(pos);
          if (!isSpace(code2) && code2 !== 10) break;
        }
      }
    }
    if (pos >= max || state.src.charCodeAt(pos) !== 41) parseReference = true;
    pos++;
  }
  if (parseReference) {
    if (typeof state.env.references === "undefined") return false;
    if (pos < max && state.src.charCodeAt(pos) === 91) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) label2 = state.src.slice(start, pos++);
      else pos = labelEnd + 1;
    } else pos = labelEnd + 1;
    if (!label2) label2 = state.src.slice(labelStart, labelEnd);
    label2 = normalizeReference(label2);
    ref = state.env.references[label2];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }
  if (!silent) {
    state.pos = labelStart;
    state.posMax = labelEnd;
    const token_o = state.push("link_open", "a", 1);
    const attrs = [["href", href]];
    token_o.attrs = attrs;
    if (title) attrs.push(["title", title]);
    if (label2) {
      const meta = /* @__PURE__ */ Object.create(null);
      meta.label = label2;
      token_o.meta = meta;
    }
    state.linkLevel++;
    state.md.inline.tokenize(state);
    state.linkLevel--;
    state.push("link_close", "a", -1);
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}
function image(state, silent) {
  let code2, content, label2, pos, ref, res, title, start;
  let href = "";
  const oldPos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(state.pos) !== 33) return false;
  if (state.src.charCodeAt(state.pos + 1) !== 91) return false;
  const labelStart = state.pos + 2;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
  if (labelEnd < 0) return false;
  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 40) {
    pos++;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (!isSpace(code2) && code2 !== 10) break;
    }
    if (pos >= max) return false;
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) pos = res.pos;
      else href = "";
    }
    start = pos;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (!isSpace(code2) && code2 !== 10) break;
    }
    res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
    if (pos < max && start !== pos && res.ok) {
      title = res.str;
      pos = res.pos;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (!isSpace(code2) && code2 !== 10) break;
      }
    } else title = "";
    if (pos >= max || state.src.charCodeAt(pos) !== 41) {
      state.pos = oldPos;
      return false;
    }
    pos++;
  } else {
    if (typeof state.env.references === "undefined") return false;
    if (pos < max && state.src.charCodeAt(pos) === 91) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) label2 = state.src.slice(start, pos++);
      else pos = labelEnd + 1;
    } else pos = labelEnd + 1;
    if (!label2) label2 = state.src.slice(labelStart, labelEnd);
    label2 = normalizeReference(label2);
    ref = state.env.references[label2];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }
  if (!silent) {
    content = state.src.slice(labelStart, labelEnd);
    const tokens = [];
    state.md.inline.parse(content, state.md, state.env, tokens);
    const token = state.push("image", "img", 0);
    const attrs = [["src", href], ["alt", ""]];
    token.attrs = attrs;
    token.children = tokens;
    token.content = content;
    if (title) attrs.push(["title", title]);
    if (label2) {
      const meta = /* @__PURE__ */ Object.create(null);
      meta.label = label2;
      token.meta = meta;
    }
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}
var EMAIL_RE = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
var AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;
function autolink(state, silent) {
  let pos = state.pos;
  if (state.src.charCodeAt(pos) !== 60) return false;
  const start = state.pos;
  const max = state.posMax;
  for (; ; ) {
    if (++pos >= max) return false;
    const ch = state.src.charCodeAt(pos);
    if (ch === 60) return false;
    if (ch === 62) break;
  }
  const url = state.src.slice(start + 1, pos);
  if (AUTOLINK_RE.test(url)) {
    const fullUrl = state.md.normalizeLink(url);
    if (!state.md.validateLink(fullUrl)) return false;
    if (!silent) {
      const token_o = state.push("link_open", "a", 1);
      token_o.attrs = [["href", fullUrl]];
      token_o.markup = "autolink";
      token_o.info = "auto";
      const token_t = state.push("text", "", 0);
      token_t.content = state.md.normalizeLinkText(url);
      const token_c = state.push("link_close", "a", -1);
      token_c.markup = "autolink";
      token_c.info = "auto";
    }
    state.pos += url.length + 2;
    return true;
  }
  if (EMAIL_RE.test(url)) {
    const fullUrl = state.md.normalizeLink(`mailto:${url}`);
    if (!state.md.validateLink(fullUrl)) return false;
    if (!silent) {
      const token_o = state.push("link_open", "a", 1);
      token_o.attrs = [["href", fullUrl]];
      token_o.markup = "autolink";
      token_o.info = "auto";
      const token_t = state.push("text", "", 0);
      token_t.content = state.md.normalizeLinkText(url);
      const token_c = state.push("link_close", "a", -1);
      token_c.markup = "autolink";
      token_c.info = "auto";
    }
    state.pos += url.length + 2;
    return true;
  }
  return false;
}
function isLinkOpen(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
  return /^<\/a\s*>/i.test(str);
}
function isLetter(ch) {
  const lc = ch | 32;
  return lc >= 97 && lc <= 122;
}
function html_inline(state, silent) {
  if (!state.md.options.html) return false;
  const max = state.posMax;
  const pos = state.pos;
  if (state.src.charCodeAt(pos) !== 60 || pos + 2 >= max) return false;
  const ch = state.src.charCodeAt(pos + 1);
  if (ch !== 33 && ch !== 63 && ch !== 47 && !isLetter(ch)) return false;
  const match = state.src.slice(pos).match(HTML_TAG_RE);
  if (!match) return false;
  if (!silent) {
    const token = state.push("html_inline", "", 0);
    token.content = match[0];
    if (isLinkOpen(token.content)) state.linkLevel++;
    if (isLinkClose(token.content)) state.linkLevel--;
  }
  state.pos += match[0].length;
  return true;
}
var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
var NAMED_RE = /^&([a-z][a-z0-9]{1,31});/i;
function entity(state, silent) {
  const pos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(pos) !== 38) return false;
  if (pos + 1 >= max) return false;
  if (state.src.charCodeAt(pos + 1) === 35) {
    const match = state.src.slice(pos).match(DIGITAL_RE);
    if (match) {
      if (!silent) {
        const code2 = match[1][0].toLowerCase() === "x" ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);
        const token = state.push("text_special", "", 0);
        token.content = isValidEntityCode(code2) ? fromCodePoint(code2) : fromCodePoint(65533);
        token.markup = match[0];
        token.info = "entity";
      }
      state.pos += match[0].length;
      return true;
    }
  } else {
    const match = state.src.slice(pos).match(NAMED_RE);
    if (match) {
      const decoded = decodeHTMLStrict(match[0]);
      if (decoded !== match[0]) {
        if (!silent) {
          const token = state.push("text_special", "", 0);
          token.content = decoded;
          token.markup = match[0];
          token.info = "entity";
        }
        state.pos += match[0].length;
        return true;
      }
    }
  }
  return false;
}
function processDelimiters(delimiters2) {
  const openersBottom = {};
  const max = delimiters2.length;
  if (!max) return;
  let headerIdx = 0;
  let lastTokenIdx = -2;
  const jumps = [];
  for (let closerIdx = 0; closerIdx < max; closerIdx++) {
    const closer = delimiters2[closerIdx];
    jumps.push(0);
    if (delimiters2[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) headerIdx = closerIdx;
    lastTokenIdx = closer.token;
    closer.length = closer.length || 0;
    if (!closer.close) continue;
    if (!openersBottom.hasOwnProperty(closer.marker)) openersBottom[closer.marker] = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + closer.length % 3];
    let openerIdx = headerIdx - jumps[headerIdx] - 1;
    let newMinOpenerIdx = openerIdx;
    for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
      const opener = delimiters2[openerIdx];
      if (opener.marker !== closer.marker) continue;
      if (opener.open && opener.end < 0) {
        let isOddMatch = false;
        if (opener.close || closer.open) {
          if ((opener.length + closer.length) % 3 === 0) {
            if (opener.length % 3 !== 0 || closer.length % 3 !== 0) isOddMatch = true;
          }
        }
        if (!isOddMatch) {
          const lastJump = openerIdx > 0 && !delimiters2[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
          jumps[closerIdx] = closerIdx - openerIdx + lastJump;
          jumps[openerIdx] = lastJump;
          closer.open = false;
          opener.end = closerIdx;
          opener.close = false;
          newMinOpenerIdx = -1;
          lastTokenIdx = -2;
          break;
        }
      }
    }
    if (newMinOpenerIdx !== -1) openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length || 0) % 3] = newMinOpenerIdx;
  }
}
function link_pairs(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  processDelimiters(state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    var _tokens_meta$curr;
    const delimiters2 = (_tokens_meta$curr = tokens_meta[curr]) === null || _tokens_meta$curr === void 0 ? void 0 : _tokens_meta$curr.delimiters;
    if (delimiters2) processDelimiters(delimiters2);
  }
}
function fragments_join(state) {
  let curr, last;
  let level = 0;
  const tokens = state.tokens;
  const max = state.tokens.length;
  for (curr = last = 0; curr < max; curr++) {
    if (tokens[curr].nesting < 0) level--;
    tokens[curr].level = level;
    if (tokens[curr].nesting > 0) level++;
    if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
    else {
      if (curr !== last) tokens[last] = tokens[curr];
      last++;
    }
  }
  if (curr !== last) tokens.length = last;
}
var _rules = [
  ["text", text],
  ["linkify", linkify],
  ["newline", newline],
  ["escape", escape],
  ["backticks", backtick],
  ["strikethrough", strikethrough_default.tokenize],
  ["emphasis", emphasis_default.tokenize],
  ["link", link],
  ["image", image],
  ["autolink", autolink],
  ["html_inline", html_inline],
  ["entity", entity]
];
var _rules2 = [
  ["balance_pairs", link_pairs],
  ["strikethrough", strikethrough_default.postProcess],
  ["emphasis", emphasis_default.postProcess],
  ["fragments_join", fragments_join]
];
var ParserInline = class {
  constructor() {
    _defineProperty(
      this,
      /**
      * {@link Ruler} instance. Keep configuration of inline rules.
      */
      "ruler",
      new Ruler()
    );
    _defineProperty(
      this,
      /**
      * {@link Ruler} instance. Second ruler used for post-processing
      * (e.g. in emphasis-like rules).
      */
      "ruler2",
      new Ruler()
    );
    _defineProperty(this, "State", StateInline);
    for (let i = 0; i < _rules.length; i++) this.ruler.push(_rules[i][0], _rules[i][1]);
    for (let i = 0; i < _rules2.length; i++) this.ruler2.push(_rules2[i][0], _rules2[i][1]);
  }
  skipToken(state) {
    const pos = state.pos;
    const rules = this.ruler.getRules("");
    const len = rules.length;
    const maxNesting = state.md.options.maxNesting;
    const cache = state.cache;
    if (typeof cache[pos] !== "undefined") {
      state.pos = cache[pos];
      return;
    }
    let ok = false;
    if (state.level < maxNesting) for (let i = 0; i < len; i++) {
      state.level++;
      ok = rules[i](state, true);
      state.level--;
      if (ok) {
        if (pos >= state.pos) throw new Error("inline rule didn't increment state.pos");
        break;
      }
    }
    else state.pos = state.posMax;
    if (!ok) state.pos++;
    cache[pos] = state.pos;
  }
  tokenize(state) {
    const rules = this.ruler.getRules("");
    const len = rules.length;
    const end = state.posMax;
    const maxNesting = state.md.options.maxNesting;
    while (state.pos < end) {
      const prevPos = state.pos;
      let ok = false;
      if (state.level < maxNesting) for (let i = 0; i < len; i++) {
        ok = rules[i](state, false);
        if (ok) {
          if (prevPos >= state.pos) throw new Error("inline rule didn't increment state.pos");
          break;
        }
      }
      if (ok) {
        if (state.pos >= end) break;
        continue;
      }
      state.pending += state.src[state.pos++];
    }
    if (state.pending) state.pushPending();
  }
  /**
  * Process input string and push inline tokens into `outTokens`
  */
  parse(str, md, env, outTokens) {
    const state = new this.State(str, md, env, outTokens);
    this.tokenize(state);
    const rules = this.ruler2.getRules("");
    const len = rules.length;
    for (let i = 0; i < len; i++) rules[i](state);
  }
};
var config = {
  default: {
    options: {
      html: false,
      xhtmlOut: false,
      breaks: false,
      langPrefix: "language-",
      linkify: false,
      typographer: false,
      quotes: "\u201C\u201D\u2018\u2019",
      highlight: null,
      maxNesting: 100
    },
    components: {
      core: {},
      block: {},
      inline: {}
    }
  },
  zero: {
    options: {
      html: false,
      xhtmlOut: false,
      breaks: false,
      langPrefix: "language-",
      linkify: false,
      typographer: false,
      quotes: "\u201C\u201D\u2018\u2019",
      highlight: null,
      maxNesting: 20
    },
    components: {
      core: { rules: [
        "normalize",
        "block",
        "strip_references",
        "inline",
        "text_join"
      ] },
      block: { rules: ["paragraph"] },
      inline: {
        rules: ["text"],
        rules2: ["balance_pairs", "fragments_join"]
      }
    }
  },
  commonmark: {
    options: {
      html: true,
      xhtmlOut: true,
      breaks: false,
      langPrefix: "language-",
      linkify: false,
      typographer: false,
      quotes: "\u201C\u201D\u2018\u2019",
      highlight: null,
      maxNesting: 20
    },
    components: {
      core: { rules: [
        "normalize",
        "block",
        "strip_references",
        "inline",
        "text_join"
      ] },
      block: { rules: [
        "blockquote",
        "code",
        "fence",
        "heading",
        "hr",
        "html_block",
        "lheading",
        "list",
        "reference",
        "paragraph"
      ] },
      inline: {
        rules: [
          "autolink",
          "backticks",
          "emphasis",
          "entity",
          "escape",
          "html_inline",
          "image",
          "link",
          "newline",
          "text"
        ],
        rules2: [
          "balance_pairs",
          "emphasis",
          "fragments_join"
        ]
      }
    }
  }
};
var BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
var GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;
var RECODE_HOSTNAME_FOR = [
  "http:",
  "https:",
  "mailto:"
];
var MarkdownIt = class {
  /**
  * Link validation function. CommonMark allows too much in links. By default
  * we disable `javascript:`, `vbscript:`, `file:` schemas, and almost all `data:...` schemas
  * except some embedded image types.
  *
  * You can change this behaviour:
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * // enable everything
  * md.validateLink = function () { return true; }
  * ```
  */
  validateLink(url) {
    const str = url.trim().toLowerCase();
    return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true;
  }
  /**
  * Function used to encode link url to a machine-readable format,
  * which includes url-encoding, punycode, etc.
  */
  normalizeLink(url) {
    const parsed = parse_default(url, true);
    if (parsed.hostname) {
      if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) try {
        parsed.hostname = import_punycode.default.toASCII(parsed.hostname);
      } catch (er) {
      }
    }
    if (parsed.auth) parsed.auth = encode_default(parsed.auth);
    if (parsed.hostname) parsed.hostname = encode_default(parsed.hostname);
    if (parsed.pathname) parsed.pathname = encode_default(parsed.pathname);
    if (parsed.search) parsed.search = encode_default(parsed.search);
    if (parsed.hash) parsed.hash = encode_default(parsed.hash);
    return format(parsed);
  }
  /**
  * Function used to decode link url to a human-readable format`
  */
  normalizeLinkText(url) {
    const parsed = parse_default(url, true);
    if (parsed.hostname) {
      if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) try {
        parsed.hostname = import_punycode.default.toUnicode(parsed.hostname);
      } catch (er) {
      }
    }
    return decode_default(format(parsed), decode_default.defaultChars + "%");
  }
  constructor(...args) {
    _defineProperty(
      this,
      /**
      * Instance of {@link ParserInline}. You may need it to add new rules when
      * writing plugins. For simple rules control use {@link MarkdownIt.disable}
      * and {@link MarkdownIt.enable}.
      */
      "inline",
      new ParserInline()
    );
    _defineProperty(
      this,
      /**
      * Instance of {@link ParserBlock}. You may need it to add new rules when
      * writing plugins. For simple rules control use {@link MarkdownIt.disable}
      * and {@link MarkdownIt.enable}.
      */
      "block",
      new ParserBlock()
    );
    _defineProperty(
      this,
      /**
      * Instance of {@link ParserCore} chain executor. You may need it to add new
      * rules when writing plugins. For simple rules control use
      * {@link MarkdownIt.disable} and {@link MarkdownIt.enable}.
      */
      "core",
      new ParserCore()
    );
    _defineProperty(
      this,
      /**
      * Instance of {@link Renderer}. Use it to modify output look. Or to add rendering
      * rules for new token types, generated by plugins.
      *
      * See {@link Renderer} docs and
      * [source code](https://github.com/markdown-it/markdown-it/blob/master/src/renderer.ts).
      *
      * @example
      * ```javascript
      * import MarkdownIt from 'markdown-it'
      * const md = new MarkdownIt()
      *
      * function myToken(tokens, idx, options, env, self) {
      *   //...
      *   return result;
      * };
      *
      * md.renderer.rules['my_token'] = myToken
      * ```
      */
      "renderer",
      new Renderer()
    );
    _defineProperty(
      this,
      /**
      * [linkify-it](https://github.com/markdown-it/linkify-it) instance.
      * Used by [linkify](https://github.com/markdown-it/markdown-it/blob/master/src/rules_core/linkify.ts)
      * rule.
      */
      "linkify",
      new LinkifyIt()
    );
    _defineProperty(
      this,
      /**
      * Assorted utility functions, useful to write plugins. See details
      * [here](https://github.com/markdown-it/markdown-it/blob/master/src/common/utils.ts).
      */
      "utils",
      utils_exports
    );
    _defineProperty(
      this,
      /**
      * Link components parser functions, useful to write plugins. See details
      * [here](https://github.com/markdown-it/markdown-it/blob/master/src/helpers).
      */
      "helpers",
      Object.assign({}, helpers_exports)
    );
    const [presetNameOrOptions, options] = args;
    if (typeof presetNameOrOptions === "string") {
      this.configure(presetNameOrOptions);
      if (options) this.set(options);
    } else {
      this.configure("default");
      this.set(presetNameOrOptions || {});
    }
  }
  /**
  * Set parser options (in the same format as in constructor). Probably, you
  * will never need it, but you can change options after constructor call.
  *
  * __Note:__ To achieve the best possible performance, don't modify a
  * `markdown-it` instance options on the fly. If you need multiple configurations
  * it's best to create multiple instances and initialize each with separate
  * config.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  *
  * const md = new MarkdownIt()
  *   .set({ html: true, breaks: true })
  *   .set({ typographer: true })
  * ```
  */
  set(options) {
    Object.assign(this.options, options);
    return this;
  }
  /**
  * Batch load of all options and compenent settings. This is internal method,
  * and you probably will not need it. But if you will - see available presets
  * and data structure [here](https://github.com/markdown-it/markdown-it/tree/master/src/presets)
  *
  * We strongly recommend to use presets instead of direct config loads. That
  * will give better compatibility with next versions.
  */
  configure(presets) {
    let p;
    if (typeof presets === "string") {
      const presetName = presets;
      p = config[presetName];
      if (!p) throw new Error(`Wrong 'markdown-it' preset "${presetName}", check name`);
    } else p = presets;
    if (!p) throw new Error("Wrong `markdown-it` preset, can't be empty");
    if (p.options) this.options = { ...p.options };
    const components = p.components;
    if (components) {
      var _components$inline;
      [
        "core",
        "block",
        "inline"
      ].forEach((name) => {
        var _components$name;
        const rules = (_components$name = components[name]) === null || _components$name === void 0 ? void 0 : _components$name.rules;
        if (rules) this[name].ruler.enableOnly(rules);
      });
      const rules2 = (_components$inline = components.inline) === null || _components$inline === void 0 ? void 0 : _components$inline.rules2;
      if (rules2) this.inline.ruler2.enableOnly(rules2);
    }
    return this;
  }
  /**
  * Enable list or rules. It will automatically find appropriate components,
  * containing rules with given names. If rule not found, and `ignoreInvalid`
  * not set - throws exception.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  *
  * const md = new MarkdownIt()
  *   .enable(['sub', 'sup'])
  *   .disable('smartquotes')
  * ```
  */
  enable(list2, ignoreInvalid = false) {
    let result = [];
    if (!Array.isArray(list2)) list2 = [list2];
    [
      "core",
      "block",
      "inline"
    ].forEach((chain) => {
      result = result.concat(this[chain].ruler.enable(list2, true));
    });
    result = result.concat(this.inline.ruler2.enable(list2, true));
    const missed = list2.filter((name) => result.indexOf(name) < 0);
    if (missed.length && !ignoreInvalid) throw new Error(`MarkdownIt. Failed to enable unknown rule(s): ${missed}`);
    return this;
  }
  /**
  * The same as {@link MarkdownIt.enable}, but turn specified rules off.
  */
  disable(list2, ignoreInvalid = false) {
    let result = [];
    if (!Array.isArray(list2)) list2 = [list2];
    [
      "core",
      "block",
      "inline"
    ].forEach((chain) => {
      result = result.concat(this[chain].ruler.disable(list2, true));
    });
    result = result.concat(this.inline.ruler2.disable(list2, true));
    const missed = list2.filter((name) => result.indexOf(name) < 0);
    if (missed.length && !ignoreInvalid) throw new Error(`MarkdownIt. Failed to disable unknown rule(s): ${missed}`);
    return this;
  }
  /**
  * Load specified plugin with given params into current parser instance.
  * It's just a sugar to call `plugin(md, params)` with curring.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * import iterator from 'markdown-it-for-inline'
  *
  * const md = new MarkdownIt()
  *   .use(iterator, 'foo_replace', 'text', function (tokens, idx) {
  *     tokens[idx].content = tokens[idx].content.replace(/foo/g, 'bar')
  *   })
  * ```
  */
  use(plugin, ...params) {
    plugin.apply(plugin, [this, ...params]);
    return this;
  }
  /**
  * Parse input string and return list of block tokens (special token type
  * "inline" will contain list of inline tokens). You should not call this
  * method directly, until you write custom renderer (for example, to produce
  * AST).
  *
  * `env` is used to pass data between "distributed" rules and return additional
  * metadata like reference info, needed for the renderer. It also can be used to
  * inject data in specific cases. Usually, you will be ok to pass `{}`,
  * and then pass updated object to renderer.
  */
  parse(src, env) {
    if (typeof src !== "string") throw new Error("Input data should be a String");
    const state = new this.core.State(src, this, env);
    this.core.process(state);
    return state.tokens;
  }
  /**
  * Render markdown string into html. It does all magic for you :).
  *
  * `env` can be used to inject additional metadata (`{}` by default).
  * But you will not need it with high probability. See also comment
  * in {@link MarkdownIt.parse}.
  */
  render(src, env = {}) {
    return this.renderer.render(this.parse(src, env), this.options, env);
  }
  /**
  * The same as {@link MarkdownIt.parse} but skip all block rules. It returns
  * the block tokens list with the single `inline` element, containing parsed
  * inline tokens in `children` property. Also updates `env` object.
  */
  parseInline(src, env) {
    const state = new this.core.State(src, this, env);
    state.inlineMode = true;
    this.core.process(state);
    return state.tokens;
  }
  /**
  * Similar to {@link MarkdownIt.render} but for single paragraph content.
  * Result will NOT be wrapped into `<p>` tags.
  */
  renderInline(src, env = {}) {
    return this.renderer.render(this.parseInline(src, env), this.options, env);
  }
};
_defineProperty(MarkdownIt, "Token", Token);
_defineProperty(MarkdownIt, "Ruler", Ruler);
_defineProperty(MarkdownIt, "Renderer", Renderer);
_defineProperty(MarkdownIt, "ParserCore", ParserCore);
_defineProperty(MarkdownIt, "StateCore", StateCore);
_defineProperty(MarkdownIt, "ParserBlock", ParserBlock);
_defineProperty(MarkdownIt, "StateBlock", StateBlock);
_defineProperty(MarkdownIt, "ParserInline", ParserInline);
_defineProperty(MarkdownIt, "StateInline", StateInline);
var MarkdownItCallable = callable(MarkdownIt);

// src/markdown.js
var markdown = new MarkdownItCallable({ html: false, linkify: false, maxNesting: 32 });
var delimiterIndexes = /* @__PURE__ */ new WeakMap();
function nextPosition(positions, from) {
  let low = 0, high = positions.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (positions[middle] < from) low = middle + 1;
    else high = middle;
  }
  return positions[low] ?? Infinity;
}
function delimiters(state) {
  let index = delimiterIndexes.get(state);
  if (!index) {
    index = { closes: [], newlines: [] };
    for (let i = 0; i < state.src.length; i++) {
      if (state.src[i] === "]" && state.src[i + 1] === "]") index.closes.push(i);
      else if (state.src[i] === "\n") index.newlines.push(i);
    }
    delimiterIndexes.set(state, index);
  }
  return index;
}
markdown.inline.ruler.before("link", "vault_link", (state, silent) => {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== "[[" || state.src[start - 1] === "!") return false;
  const index = delimiters(state);
  const end = nextPosition(index.closes, start + 2);
  if (end >= state.posMax || nextPosition(index.newlines, start + 2) < end) return false;
  const content = state.src.slice(start + 2, end);
  if (!content) return false;
  const divider = content.indexOf("|");
  const target = divider < 0 ? content : content.slice(0, divider);
  const label2 = divider < 0 ? content : content.slice(divider + 1);
  if (!silent) {
    const token = state.push("vault_link", "", 0);
    token.content = label2;
    token.meta = { target };
  }
  state.pos = end + 2;
  return true;
});
var tags = /* @__PURE__ */ new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "strong",
  "em",
  "s",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td"
]);
function noteLinkTarget(href, encoded = false) {
  try {
    const decoded = encoded ? decodeURIComponent(href) : href;
    if (!decoded || /[\u0000-\u001f\\]/.test(decoded) || decoded.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}
function unclosed(text2, marker) {
  const parts = text2.split(marker);
  return parts.length % 2 === 0 && /^\S/.test(parts.at(-1));
}
function settleStreaming(source) {
  let text2 = source;
  let lastBreak = text2.lastIndexOf("\n");
  let line = text2.slice(lastBreak + 1);
  if (line.length < 16 && /^\s*(?:[-=*_#>+]+|\d+[.)])?\s*$/.test(line) || /^ {0,3}(?:```|~~~)/.test(line)) {
    text2 = text2.slice(0, lastBreak + 1);
  }
  if ((text2.match(/^ {0,3}(?:```|~~~)/gm) ?? []).length % 2) return text2;
  let end = text2.length;
  while (end && "*_~` 	\n".includes(text2[end - 1])) end--;
  text2 = text2.slice(0, end);
  lastBreak = text2.lastIndexOf("\n");
  line = text2.slice(lastBreak + 1);
  const wiki = line.lastIndexOf("[[");
  const target = line.lastIndexOf("](");
  if (wiki >= 0 && !line.includes("]]", wiki) && line[wiki - 1] !== "!") {
    const inner = line.slice(wiki + 2);
    line = line.slice(0, wiki) + (inner.includes("|") ? inner.slice(inner.lastIndexOf("|") + 1) : "");
  } else if (target >= 0 && !/[)\s]/.test(line.slice(target + 2))) {
    const open = line.lastIndexOf("[", target);
    if (open >= 0 && !line.slice(open + 1, target).includes("]")) line = line.slice(0, open) + line.slice(open + 1, target);
  }
  text2 = text2.slice(0, lastBreak + 1) + line;
  const block2 = text2.slice(text2.lastIndexOf("\n\n") + 1);
  let suffix = "";
  if ((block2.match(/`/g) ?? []).length % 2) suffix += "`";
  const prose = block2.replace(/`[^`]*`?/g, "");
  if (unclosed(prose.replace(/\*\*/g, "").replace(/^[ \t]*\* /gm, ""), "*")) suffix += "*";
  if (unclosed(prose, "**")) suffix += "**";
  if (unclosed(prose, "~~")) suffix += "~~";
  return text2 + suffix;
}
function renderMarkdown(container, source, { openNote, sourcePath = "" } = {}) {
  const document = container.ownerDocument;
  const fragment = document.createDocumentFragment();
  const stack = [fragment];
  const wireNote = (element, target) => {
    if (!openNote) return;
    element.classList.add("internal-link");
    element.setAttribute("href", "#");
    element.dataset.note = JSON.stringify(target);
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openNote(target, sourcePath, event.metaKey || event.ctrlKey);
    });
  };
  const append = (tokens) => {
    for (const token of tokens) {
      const parent = stack.at(-1);
      if (token.type === "inline") {
        append(token.children ?? []);
        continue;
      }
      if (token.type === "vault_link") {
        const link2 = document.createElement("a");
        link2.textContent = token.content;
        const target = noteLinkTarget(token.meta.target);
        if (target) wireNote(link2, target);
        parent.append(link2);
      } else if (token.type === "text" || token.type === "softbreak") {
        parent.append(document.createTextNode(token.type === "softbreak" ? "\n" : token.content));
      } else if (token.type === "image") {
        parent.append(document.createTextNode(`![${token.content}](${token.attrGet("src") ?? ""})`));
      } else if (token.type === "code_inline" || token.type === "fence" || token.type === "code_block") {
        const code2 = document.createElement("code");
        code2.textContent = token.content;
        if (token.type === "code_inline") parent.append(code2);
        else {
          const pre = document.createElement("pre");
          pre.append(code2);
          parent.append(pre);
        }
      } else if (token.type === "hardbreak" || token.type === "hr") {
        parent.append(document.createElement(token.type === "hr" ? "hr" : "br"));
      } else if (tags.has(token.tag)) {
        if (token.nesting === -1) {
          const closed = stack.pop();
          const host = closed.dataset?.externalHost;
          if (host && ![host, closed.getAttribute("href")].includes(closed.textContent.trim())) {
            const label2 = document.createElement("span");
            label2.className = "sir-scribbles-link-host";
            label2.textContent = ` (${host})`;
            closed.after(label2);
          }
          continue;
        }
        const element = document.createElement(token.tag);
        if (token.tag === "a") {
          const href = token.attrGet("href") ?? "";
          if (/^(https?:\/\/|mailto:)/i.test(href)) {
            element.setAttribute("href", href);
            element.setAttribute("target", "_blank");
            element.setAttribute("rel", "noopener noreferrer");
            try {
              if (/^https?:/i.test(href)) element.dataset.externalHost = new URL(href).host;
            } catch {
            }
          } else if (href.startsWith("obsidian://open?")) {
            try {
              const url = new URL(href);
              const target = noteLinkTarget(url.searchParams.get("file") ?? "");
              if (target && openNote) wireNote(element, { path: target, vault: url.searchParams.get("vault") });
            } catch {
            }
          } else {
            const target = noteLinkTarget(href, true);
            if (target) wireNote(element, target);
          }
          const title = token.attrGet("title");
          const external = element.hasAttribute("href") && element.getAttribute("href") !== "#";
          if (external) element.title = title ? `${title}
${href}` : href;
          else if (title) element.title = title;
        } else if (token.tag === "ol") {
          const start = token.attrGet("start");
          if (start && /^\d+$/.test(start)) element.setAttribute("start", start);
        }
        parent.append(element);
        if (token.nesting === 1) stack.push(element);
      }
    }
  };
  append(markdown.parse(source, {}));
  let kept = container.firstChild;
  while (kept && fragment.firstChild?.isEqualNode(kept)) {
    fragment.firstChild.remove();
    kept = kept.nextSibling;
  }
  while (kept) {
    const stale = kept;
    kept = kept.nextSibling;
    stale.remove();
  }
  container.append(fragment);
}

// src/mascot.js
var MASCOT_URL = "data:image/png;base64,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";

// src/icon.js
var ICON_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABeUlEQVR4nN2XsUoDQRCG8yZW2gmCXUrBB0hjZRMsLAKWYhEbG8EHsAlCKh/BNPoSgoUgiDamSaE+wMoE/jBsZmdndvdSePDB3Saz8+3s3B3X6/2HY297K2hsRCB8nIssZrvdy2gCXIToTAAJchRXIrfPKVISRQIvb59ZpAaMZVwCCB5f34af37mKJNNUQFv50fBsCR+jmHjP3T3AV64lk8b4lpgF4j2sEaBr94rvTvoBtBCgeGkrVIH3yelSwNL1ub7AORalJifDlgIczGkSAFS6p8vDKrAFRQJ0/To5DouHCzP0fxDLYE5VgOBBfMIa3AJ85XQevp9XFbHCY2hO8zNAEsBvHgEeg4o2E7gfHSRpJpACiR6vBmtIIlUCX9ObFbHAYH9nTQBjEEBsswrwlecEiPhWNL+ILAIaRQJcJPUckASkSmxEgBIDPsYbkSc2vxFzAvFdwEUg4Op+SSB+LGsiEkWl1ypRQvUnmlQJr4A7qUXGQzOBro4/L+tCa3zNdeUAAAAASUVORK5CYII=";

// src/panel.js
var DECISIONS = { allow_once: "Allow once", reject_once: "Deny once", allow_always: "Always allow", reject_always: "Always deny" };
var STATES = {
  "not-started": "Not started",
  starting: "Starting",
  connected: "Choose a chat",
  ready: "Ready",
  working: "Working",
  "waiting-for-approval": "Waiting for approval",
  stopping: "Stopping",
  failed: "Failed",
  terminated: "Terminated"
};
var ChatPanel = class {
  constructor(container, controller, { getPath, savePath, attachSelection, attachFile, confirmReset, copyText, openNote, setIcon: setIcon2 }) {
    this.container = container;
    this.model = controller;
    this.actions = { getPath, savePath, attachSelection, attachFile, confirmReset, copyText, openNote, setIcon: setIcon2 };
    this.document = container.ownerDocument;
    this.rows = /* @__PURE__ */ new Map();
    this.timer = null;
    this.disposed = false;
    this.lastCard = null;
    this.lastQueued = -1;
    this.lastSelection = void 0;
    this.lastPath = null;
    this.lastModel = null;
    this.lastHistory = void 0;
    this.streaming = /* @__PURE__ */ new Set();
    this.frame = null;
    this.lastFrame = 0;
    this.paintAfter = 0;
    this.initialized = false;
    const view = this.document.defaultView;
    this.animate = typeof view?.requestAnimationFrame === "function" && !view.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.build();
    this.listener = () => this.schedule();
    controller.on("change", this.listener);
    this.render();
  }
  el(tag, className = "", text2 = "") {
    const node = this.document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text2;
    return node;
  }
  button(text2, action, className = "") {
    const button = this.el("button", className, text2);
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  }
  // Icons come from Obsidian's setIcon when available; the label doubles as
  // the accessible name, Obsidian's tooltip and the text fallback.
  iconButton(icon, label2, action, className = "") {
    const button = this.button("", action, `clickable-icon ${className}`.trim());
    this.setIcon(button, icon, label2);
    return button;
  }
  setIcon(node, icon, label2) {
    node.setAttribute("aria-label", label2);
    if (this.actions.setIcon) {
      node.replaceChildren();
      this.actions.setIcon(node, icon);
    } else node.textContent = label2;
  }
  build() {
    this.container.replaceChildren();
    this.container.classList.add("sir-scribbles");
    const header = this.el("header", "sir-scribbles-header");
    const mascot = this.el("img", "sir-scribbles-mark");
    mascot.src = ICON_URL;
    mascot.alt = "";
    this.status = this.el("span", "sir-scribbles-status");
    this.status.setAttribute("role", "status");
    this.identity = this.el("span", "sir-scribbles-identity");
    header.append(mascot, this.status, this.identity);
    if (this.actions.confirmReset) {
      this.reset = this.iconButton("plus", "New chat", async () => {
        if ((this.model.messages.length || this.model.draft || this.model.selection || this.model.file) && !await this.actions.confirmReset()) return;
        await this.model.newChat();
      }, "sir-scribbles-reset");
      header.append(this.reset);
    }
    this.container.append(header);
    this.error = this.el("div", "sir-scribbles-error");
    this.error.setAttribute("role", "alert");
    this.container.append(this.error);
    this.transcript = this.el("div", "sir-scribbles-transcript");
    this.empty = this.el("section", "sir-scribbles-empty");
    const emptyMascot = this.el("img", "sir-scribbles-empty-mark");
    emptyMascot.src = MASCOT_URL;
    emptyMascot.alt = "";
    const directory = this.el("p", "sir-scribbles-directory", this.model.cwd);
    directory.title = this.model.cwd;
    this.empty.append(
      emptyMascot,
      this.el("h3", "", "A little room to think."),
      this.el("p", "sir-scribbles-lede", "Ask about your work. Bring a selection from a note when it helps."),
      directory
    );
    this.startArea = this.el("section", "sir-scribbles-start-area");
    this.startArea.append(this.el("h4", "", "Connect your local agent"));
    this.path = this.el("input", "sir-scribbles-path");
    this.path.type = "text";
    this.path.placeholder = "/absolute/path/to/agent";
    this.path.setAttribute("aria-label", "Agent executable path");
    this.path.spellcheck = false;
    this.path.value = this.actions.getPath();
    this.start = this.button("Start agent", () => this.launch("start"), "mod-cta sir-scribbles-primary");
    this.browse = this.button("Open a past chat", () => this.launch("browse"), "sir-scribbles-secondary");
    const launchRow = this.el("div", "sir-scribbles-launch");
    launchRow.append(this.start, this.browse);
    this.startArea.append(
      this.path,
      this.el("p", "sir-scribbles-caption", "The agent uses its existing permissions and project configuration. Starting it may initialize configured hooks or MCP servers."),
      launchRow
    );
    this.pathHelp = this.el("p", "sir-scribbles-caption", "Executable saved. Send your first prompt to start the agent, or use Start agent. Change the path in Settings \u2192 Community plugins \u2192 Sir Scribbles.");
    this.startArea.append(this.pathHelp);
    this.empty.append(
      this.startArea,
      this.el("p", "sir-scribbles-footnote", "The agent may run actions already allowed by its own configuration without asking here. The vault directory is context, not a sandbox."),
      this.el("p", "sir-scribbles-footnote", "Developer preview \xB7 Kiro CLI (V3) is currently the only supported agent")
    );
    this.historyArea = this.el("section", "sir-scribbles-history");
    this.historyArea.setAttribute("aria-label", "Past chats");
    this.transcript.append(this.historyArea, this.empty);
    this.container.append(this.transcript);
    this.permissionArea = this.el("section", "sir-scribbles-permission-area");
    this.permissionArea.setAttribute("aria-label", "Action requiring permission");
    this.container.append(this.permissionArea);
    const footer = this.el("footer", "sir-scribbles-footer");
    this.selectionArea = this.el("section", "sir-scribbles-selection");
    const composer = this.el("div", "sir-scribbles-composer");
    this.composer = this.el("textarea", "sir-scribbles-prompt");
    this.composer.placeholder = "What are you working on?";
    this.composer.rows = 2;
    this.composer.addEventListener("input", () => {
      this.model.setDraft(this.composer.value);
      this.fitComposer();
      this.renderControls();
    });
    this.composer.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        if (!event.repeat && !this.send.disabled) void this.model.send(this.actions.getPath().trim());
      }
    });
    const toolbar = this.el("div", "sir-scribbles-composer-toolbar");
    this.attach = this.iconButton("quote", "Attach selection", async () => {
      await this.attachContext("attachSelection", "SELECT_TEXT_FIRST");
    }, "sir-scribbles-attach");
    this.attachFile = this.iconButton("file-text", "Attach current note", async () => {
      if (this.model.file) {
        this.model.removeFile();
        return;
      }
      await this.attachContext("attachFile", "OPEN_NOTE_FIRST");
    }, "sir-scribbles-attach");
    this.modelPicker = this.el("select", "dropdown sir-scribbles-model");
    this.modelPicker.setAttribute("aria-label", "Model");
    this.modelPicker.addEventListener("change", () => {
      void this.model.setModel(this.modelPicker.value);
    });
    this.force = this.button("Force stop agent", () => {
      void this.model.forceStop();
    }, "sir-scribbles-danger");
    this.send = this.button("", () => {
      void this.model.send(this.actions.getPath().trim());
    }, "mod-cta sir-scribbles-send");
    this.setIcon(this.send, "arrow-up", "Send");
    this.stop = this.button("", () => this.model.stop(), "sir-scribbles-send sir-scribbles-stop");
    this.setIcon(this.stop, "square", "Stop");
    toolbar.append(this.attach, this.attachFile, this.modelPicker, this.force, this.stop, this.send);
    composer.append(this.selectionArea, this.composer, toolbar);
    footer.append(composer);
    this.container.append(footer);
  }
  // Start a new chat, or start the agent to list past ones.
  async launch(method) {
    const saved = this.actions.getPath().trim();
    const executable = saved || this.path.value.trim();
    const generation = this.model.generation;
    this.startPending = true;
    this.renderControls();
    try {
      if (!saved) await this.actions.savePath(executable);
      if (this.disposed || generation !== this.model.generation) return;
      await this.model[method](executable);
    } catch {
      if (!this.disposed && generation === this.model.generation) this.model.setError("EXECUTABLE_NOT_AVAILABLE");
    } finally {
      this.startPending = false;
      if (!this.disposed) this.render();
    }
  }
  fitComposer() {
    this.composer.style.height = "auto";
    if (this.composer.scrollHeight) this.composer.style.height = `${this.composer.scrollHeight}px`;
  }
  async attachContext(action, errorCode) {
    const generation = this.model.generation;
    try {
      const snapshot = await this.actions[action]();
      if (!this.disposed && !this.model.resetting && generation === this.model.generation) this.model.attach(snapshot);
    } catch (error) {
      if (!this.disposed && generation === this.model.generation) this.model.setError(error.code || errorCode);
    }
  }
  schedule() {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.disposed) this.render();
    }, 40);
  }
  renderControls() {
    const model = this.model;
    const canStart = model.state === "not-started" && Boolean(this.actions.getPath().trim()) || model.state === "connected";
    this.send.disabled = !(model.state === "ready" || canStart) || model.resetting || model.disposed || model.configPending || Boolean(model.history?.pending) || !(model.draft.trim() || model.selection || model.file);
    this.send.title = canStart ? "Start a new chat and send (Enter)" : "Send (Enter)";
    this.start.disabled = model.state !== "not-started" || model.resetting || this.startPending;
    this.browse.disabled = this.start.disabled;
    this.path.disabled = model.state !== "not-started" || model.resetting;
    this.path.hidden = Boolean(this.actions.getPath().trim());
    this.pathHelp.hidden = !this.path.hidden;
    if (this.reset) this.reset.disabled = model.resetting || model.disposed;
    this.attach.disabled = model.resetting || model.disposed;
    this.attachFile.disabled = model.resetting || model.disposed;
    this.attachFile.setAttribute("aria-pressed", String(Boolean(model.file)));
    this.attachFile.setAttribute("aria-label", model.file ? "Remove attached note" : "Attach current note");
    this.attachFile.classList.toggle("is-active", Boolean(model.file));
    this.attach.setAttribute("aria-pressed", String(Boolean(model.selection)));
    this.attach.setAttribute("aria-label", model.selection ? "Replace selection with the current one" : "Attach selection");
    this.attach.classList.toggle("is-active", Boolean(model.selection));
    this.stop.hidden = !["starting", "working", "waiting-for-approval", "stopping"].includes(model.state);
    this.stop.disabled = model.state === "stopping" || model.resetting;
    this.send.hidden = !this.stop.hidden;
    this.modelPicker.disabled = model.state !== "ready" || model.configPending || model.resetting;
    this.force.hidden = !model.forceAvailable;
    this.force.disabled = model.resetting;
  }
  render() {
    const model = this.model;
    this.status.textContent = STATES[model.state] ?? model.state;
    this.status.dataset.state = model.state;
    this.status.title = model.cwd;
    this.identity.textContent = model.identity || "";
    this.error.textContent = model.error + (model.cleanup === "observed" ? `${model.error ? "\n" : ""}Owned process cleanup observed.` : "");
    this.error.hidden = !this.error.textContent;
    const path = this.actions.getPath();
    if (this.lastPath !== path && this.document.activeElement !== this.path) this.path.value = path;
    this.lastPath = path;
    this.startArea.hidden = model.state !== "not-started";
    this.empty.hidden = model.messages.length > 0 || model.state === "connected" || model.loading;
    if (this.composer.value !== model.draft) {
      this.composer.value = model.draft;
      this.fitComposer();
    }
    this.renderControls();
    this.renderMessages();
    this.renderSelection();
    this.renderPermission();
    this.renderModel();
    this.renderHistory();
  }
  // Past chats for this vault, shown after the agent starts for browsing.
  renderHistory() {
    const model = this.model;
    const history = model.state === "connected" && !model.loading ? model.history : null;
    if (history === this.lastHistory) return;
    this.lastHistory = history;
    this.historyArea.replaceChildren();
    this.historyArea.hidden = !history;
    if (!history) return;
    this.historyArea.append(this.el("h4", "", "Past chats in this vault"));
    if (history.pending) this.historyArea.append(this.el("p", "sir-scribbles-caption", "Asking the agent for past chats\u2026"));
    else if (history.error) {
      this.historyArea.append(this.el("p", "sir-scribbles-caption", history.error));
      if (history.retry) this.historyArea.append(this.button("Try again", () => {
        void model.browse();
      }, "sir-scribbles-secondary"));
    } else if (!history.entries.length) this.historyArea.append(this.el("p", "sir-scribbles-caption", "No past chats for this vault yet."));
    else {
      const list2 = this.el("ul", "sir-scribbles-history-list");
      for (const entry of history.entries) {
        const item = this.el("li");
        const title = entry.title || "Untitled chat";
        const button = this.button("", () => {
          void model.open(entry.sessionId, entry.title);
        }, "sir-scribbles-history-item");
        button.append(this.el("span", "sir-scribbles-history-title", title));
        if (entry.updatedAt !== null) {
          const date = new Date(entry.updatedAt);
          const time = this.el("time", "sir-scribbles-history-date", date.toLocaleDateString([], { month: "short", day: "numeric" }));
          time.dateTime = date.toISOString();
          time.title = date.toLocaleString();
          button.append(time);
        }
        button.title = title;
        item.append(button);
        list2.append(item);
      }
      this.historyArea.append(list2);
    }
    const fresh = this.button("Start a new chat", () => {
      void model.open();
    }, "sir-scribbles-secondary");
    fresh.disabled = Boolean(history.pending);
    this.historyArea.append(fresh);
  }
  // Agents replace the whole option list on every change, so a new object
  // means new choices; the current value is synced on every render.
  renderModel() {
    const option = this.model.modelOption();
    this.modelPicker.hidden = !option;
    if (!option) {
      this.lastModel = null;
      return;
    }
    if (option !== this.lastModel) {
      this.lastModel = option;
      const groups = /* @__PURE__ */ new Map();
      this.modelPicker.replaceChildren();
      for (const value of option.options) {
        const item = this.el("option", "", value.name);
        item.value = value.value;
        if (value.description) item.title = value.description;
        let parent = this.modelPicker;
        if (value.group) {
          parent = groups.get(value.group);
          if (!parent) {
            parent = this.el("optgroup");
            parent.label = value.group;
            groups.set(value.group, parent);
            this.modelPicker.append(parent);
          }
        }
        parent.append(item);
      }
    }
    const current = option.options.find((value) => value.value === option.currentValue);
    this.modelPicker.value = option.currentValue;
    this.modelPicker.title = [option.name, current?.description].filter(Boolean).join(" \xB7 ");
  }
  renderMessages() {
    const nearBottom = this.transcript.scrollHeight - this.transcript.scrollTop - this.transcript.clientHeight < 80;
    const existing = new Set(this.model.messages);
    for (const [message, row] of this.rows) {
      if (!existing.has(message)) {
        row.root.remove();
        this.rows.delete(message);
        this.streaming.delete(row);
      }
    }
    if (this.frame && !this.streaming.size) {
      this.document.defaultView.cancelAnimationFrame?.(this.frame);
      this.frame = null;
      this.lastFrame = 0;
    }
    for (const message of this.model.messages) {
      let row = this.rows.get(message);
      if (!row) {
        const root = this.el("article", `sir-scribbles-message sir-scribbles-${message.role}`);
        const meta = this.el("div", "sir-scribbles-message-meta");
        const label2 = this.el("span", "sir-scribbles-sr-only", message.role === "user" ? "You" : message.role === "tool" ? "Tool activity" : "Agent");
        if (message.timestamp !== null) {
          const timestamp = this.el("time", "sir-scribbles-timestamp");
          const date = new Date(message.timestamp ?? Date.now());
          timestamp.dateTime = date.toISOString();
          timestamp.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          timestamp.title = date.toLocaleString();
          meta.append(timestamp);
        }
        meta.append(this.iconButton("copy", "Copy", async () => {
          try {
            await this.actions.copyText(message.text);
          } catch {
            this.model.error = "Could not copy. Select the text and copy it manually.";
            this.model.changed();
          }
        }, "sir-scribbles-copy"));
        let body;
        if (message.role === "tool") {
          const details = this.el("details", "sir-scribbles-tool-details");
          body = this.el("pre", "sir-scribbles-plain-text");
          const summary = this.el("summary");
          details.append(summary, body);
          root.append(label2, details, meta);
          row = { root, body, summary, label: label2, rendered: "" };
        } else {
          body = this.el("div", message.role === "agent" ? "sir-scribbles-markdown" : "sir-scribbles-plain-text");
          root.append(label2, body, meta);
          row = { root, body, label: label2, rendered: "" };
        }
        this.rows.set(message, row);
        this.transcript.append(root);
      }
      if (row.summary) row.summary.textContent = `${typeof message.data.title === "string" ? message.data.title : "Tool"} \xB7 ${typeof message.data.status === "string" ? message.data.status : "pending"}`;
      if (message.role === "agent") this.updateReply(row, message);
      else if (message.text !== row.rendered) {
        row.body.textContent = message.text;
        row.rendered = message.text;
      }
    }
    const last = this.model.messages.at(-1);
    for (const [message, row] of this.rows) {
      if (message.role === "agent") row.root.classList.toggle("is-streaming", this.streaming.has(row) || message === last && this.model.state === "working");
    }
    this.initialized = true;
    if (nearBottom) this.transcript.scrollTop = this.transcript.scrollHeight;
  }
  // Streamed text arrives in uneven bursts. Reveal it at a pace that follows
  // the backlog: steady for small chunks, catching up quickly on large ones.
  updateReply(row, message) {
    if (row.target === message.text) {
      if (!this.streaming.has(row)) this.paintReply(row);
      return;
    }
    if (!message.text.startsWith(row.target ?? "")) row.shown = 0;
    row.target = message.text;
    row.message = message;
    if (!this.animate || !this.initialized || this.model.loading || message.timestamp === null) {
      row.shown = message.text.length;
      this.paintReply(row);
      return;
    }
    row.shown ??= 0;
    this.streaming.add(row);
    this.requestFrame();
  }
  paintReply(row) {
    const text2 = row.message.text;
    const writing = row.message === this.model.messages.at(-1) && this.model.state === "working";
    const visible = row.shown >= text2.length && !writing ? text2 : settleStreaming(text2.slice(0, row.shown));
    if (visible === row.rendered) return;
    renderMarkdown(row.body, visible, {
      sourcePath: row.message.sourcePath,
      openNote: this.actions.openNote ? async (...args) => {
        try {
          if (!this.disposed) await this.actions.openNote(...args);
        } catch {
          if (!this.disposed) {
            this.model.error = "Could not open that note in this vault.";
            this.model.changed();
          }
        }
      } : void 0
    });
    row.rendered = visible;
  }
  requestFrame() {
    if (this.frame || this.disposed || !this.streaming.size) return;
    this.frame = this.document.defaultView.requestAnimationFrame((now) => {
      this.frame = null;
      if (this.disposed) return;
      const elapsed = Math.min(now - (this.lastFrame || now - 16), 250);
      const settle = this.model.state === "working" ? 250 : 80;
      if (now < this.paintAfter) {
        this.requestFrame();
        return;
      }
      const pinned = this.transcript.scrollHeight - this.transcript.scrollTop - this.transcript.clientHeight < 80;
      const started = performance.now();
      for (const row of this.streaming) {
        const total = row.message.text.length;
        const backlog = total - row.shown;
        row.shown = Math.min(total, row.shown + Math.max(Math.ceil(elapsed * 0.08), Math.ceil(backlog * (1 - Math.exp(-elapsed / settle)))));
        this.paintReply(row);
        if (row.shown >= total) {
          this.streaming.delete(row);
          row.root.classList.toggle("is-streaming", row.message === this.model.messages.at(-1) && this.model.state === "working");
        }
      }
      this.paintAfter = now + (performance.now() - started) * 4;
      this.lastFrame = now;
      if (pinned) this.transcript.scrollTop = this.transcript.scrollHeight;
      if (this.streaming.size) this.requestFrame();
      else this.lastFrame = 0;
    });
  }
  renderSelection() {
    const selection = this.model.selection;
    const file = this.model.file;
    if (selection === this.lastSelection && file === this.lastFile) return;
    this.lastFile = file;
    this.lastSelection = selection;
    this.selectionArea.replaceChildren();
    this.selectionArea.hidden = !selection && !file;
    if (file) {
      const fileCard = this.el("div", "sir-scribbles-context-card");
      const fileRow = this.el("div", "sir-scribbles-selection-header");
      const path2 = this.el("span", "sir-scribbles-context-path", file.path);
      path2.title = `${file.path} \xB7 path only`;
      fileRow.append(
        this.el("span", "sir-scribbles-context-label", "Note"),
        path2,
        this.iconButton("x", "Remove file", () => this.model.removeFile(), "sir-scribbles-context-remove")
      );
      fileCard.append(fileRow);
      this.selectionArea.append(fileCard);
    }
    if (!selection) return;
    const selectionCard = this.el("div", "sir-scribbles-context-card");
    const details = this.el("details");
    details.open = false;
    const summary = this.el("summary", "sir-scribbles-selection-header");
    const path = this.el("span", "sir-scribbles-context-path", `${selection.path}:${selection.from}\u2013${selection.to}`);
    path.title = `${selection.path} \xB7 lines ${selection.from}\u2013${selection.to} \xB7 click to preview`;
    summary.append(
      this.el("span", "sir-scribbles-context-label", "Selection"),
      path,
      this.iconButton("x", "Remove selection", (event) => {
        event.preventDefault();
        this.model.removeSelection();
      }, "sir-scribbles-context-remove")
    );
    details.append(summary, this.el("pre", "sir-scribbles-selection-text", selection.text));
    selectionCard.append(details);
    this.selectionArea.append(selectionCard);
  }
  renderPermission() {
    const card = this.model.activePermission();
    const queued = (this.model.session?.permissions.size ?? 0) - (card ? 1 : 0);
    if (card === this.lastCard && queued === this.lastQueued) return;
    this.lastCard = card;
    this.lastQueued = queued;
    this.permissionArea.replaceChildren();
    this.permissionArea.hidden = !card;
    if (!card) return;
    this.permissionArea.append(
      this.el("p", "sir-scribbles-eyebrow", queued ? `Approval needed \xB7 ${queued} more queued` : "Approval needed"),
      this.el("h3", "", card.params.toolCall.title || `Tool ${card.params.toolCall.toolCallId}`),
      this.el("p", "sir-scribbles-caption", `Kind: ${card.params.toolCall.kind || "Not supplied"} \xB7 Request ${card.id}`)
    );
    if (card.params.toolCall.rawInput == null) this.permissionArea.append(this.el("p", "sir-scribbles-caption", "Tool arguments were not supplied. Review the available details before deciding."));
    if (!card.params.toolCall.locations?.length) this.permissionArea.append(this.el("p", "sir-scribbles-caption", "Affected paths not supplied."));
    if (!card.params._meta?.kiro?.consent) this.permissionArea.append(this.el("p", "sir-scribbles-caption", "Working-directory / consent context not supplied."));
    if (card.unrecognized?.length) this.permissionArea.append(this.el(
      "p",
      "sir-scribbles-caption",
      `Unrecognized approval metadata: ${card.unrecognized.join(", ")}. It is shown in the details below; your choice still applies once only.`
    ));
    const details = this.el("details", "sir-scribbles-permission-details");
    details.open = true;
    details.append(this.el("summary", "", "Action details"), this.el("pre", "sir-scribbles-permission-input", JSON.stringify(card.request ? { request: card.request, resolvedToolCall: card.params.toolCall } : card.params)));
    this.permissionArea.append(details);
    if (card.rule) {
      const rule = this.el("p", "sir-scribbles-caption sir-scribbles-rule", "Always choices ask the agent to save a rule for this vault only: ");
      rule.append(
        this.el("code", "", `${card.rule.capability} \xB7 ${card.rule.resource}`),
        ". If that is a folder, the rule also covers everything inside it. The agent then stops asking for matching actions in every chat, and keeps the rule outside the vault, in its own settings."
      );
      this.permissionArea.append(rule);
    }
    const decisions = this.el("div", "sir-scribbles-decisions");
    for (const option of card.options) {
      const label2 = DECISIONS[option.kind];
      const button = this.button(option.name.trim().toLowerCase() === label2.toLowerCase() ? label2 : `${label2} \xB7 ${option.name}`, () => {
        for (const child of decisions.children) child.disabled = true;
        this.model.decide(card, option.optionId);
        this.renderPermission();
      }, option.kind === "allow_once" ? "mod-cta" : "");
      decisions.append(button);
    }
    this.permissionArea.append(decisions);
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    if (this.frame) this.document.defaultView.cancelAnimationFrame?.(this.frame);
    this.streaming.clear();
    this.model.off("change", this.listener);
    this.rows.clear();
    this.container.replaceChildren();
  }
};

// src/tabs.js
var BUSY = ["starting", "working", "waiting-for-approval", "stopping"];
var ChatTabs = class extends import_node_events3.EventEmitter {
  constructor(createChat, limit = LIMITS.chats) {
    super();
    this.createChat = createChat;
    this.limit = limit;
    this.chats = [];
    this.active = null;
    this.disposed = false;
    this.listener = () => this.emit("change");
  }
  get full() {
    return this.chats.length >= this.limit;
  }
  add() {
    if (this.disposed || this.full) return null;
    const chat = this.createChat();
    chat.on("change", this.listener);
    this.chats.push(chat);
    this.active = chat;
    this.emit("change");
    return chat;
  }
  select(chat) {
    if (!this.chats.includes(chat) || chat === this.active) return;
    this.active = chat;
    this.emit("change");
  }
  // Ends the chat's agent. A chat whose cleanup is uncertain stays open so
  // the user can force stop it; the last tab is replaced by a fresh one.
  async close(chat) {
    if (this.disposed || !this.chats.includes(chat) || chat.closing) return false;
    chat.closing = true;
    this.emit("change");
    const clean = await chat.dispose();
    chat.closing = false;
    if (this.disposed) return clean;
    if (!clean) {
      chat.recoverCleanup();
      chat.on("change", this.listener);
      this.emit("change");
      return false;
    }
    const index = this.chats.indexOf(chat);
    this.chats.splice(index, 1);
    if (this.active === chat) this.active = this.chats[Math.min(index, this.chats.length - 1)] ?? null;
    if (this.chats.length) this.emit("change");
    else this.add();
    return true;
  }
  // Ends every agent. Chats with uncertain cleanup are kept for recover().
  async dispose() {
    this.disposed = true;
    const chats = this.chats;
    const results = await Promise.all(chats.map((chat) => chat.dispose()));
    this.chats = chats.filter((chat, index) => !results[index]);
    this.active = this.chats[0] ?? null;
    return results.every(Boolean);
  }
  recover() {
    this.disposed = false;
    for (const chat of this.chats) {
      chat.recoverCleanup();
      chat.on("change", this.listener);
    }
  }
};
var TabbedPanel = class {
  constructor(container, tabs, actions) {
    this.container = container;
    this.tabs = tabs;
    this.actions = actions;
    this.document = container.ownerDocument;
    this.entries = /* @__PURE__ */ new Map();
    this.timer = null;
    this.disposed = false;
    container.replaceChildren();
    container.classList.add("sir-scribbles-root");
    this.strip = this.el("div", "sir-scribbles-tabs");
    this.strip.setAttribute("role", "tablist");
    this.strip.setAttribute("aria-label", "Chats");
    this.add = this.iconButton("plus", "New chat", () => {
      const chat = this.tabs.add();
      if (chat) this.render();
    }, "sir-scribbles-tab-add");
    this.panes = this.el("div", "sir-scribbles-panes");
    container.append(this.strip, this.panes);
    this.listener = () => this.schedule();
    tabs.on("change", this.listener);
    this.render();
  }
  el(tag, className = "", text2 = "") {
    const node = this.document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text2;
    return node;
  }
  iconButton(icon, label2, action, className) {
    const button = this.el("button", `clickable-icon ${className}`);
    button.type = "button";
    button.setAttribute("aria-label", label2);
    if (this.actions.setIcon) this.actions.setIcon(button, icon);
    else button.textContent = label2;
    button.addEventListener("click", action);
    return button;
  }
  schedule() {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.disposed) this.render();
    }, 40);
  }
  entry(chat) {
    const pane = this.el("div");
    pane.setAttribute("role", "tabpanel");
    this.panes.append(pane);
    const panel = new ChatPanel(pane, chat, { ...this.actions, confirmReset: void 0 });
    const tab = this.el("div", "sir-scribbles-tab");
    const select = this.el("button", "sir-scribbles-tab-select");
    select.type = "button";
    select.setAttribute("role", "tab");
    const status = this.el("span", "sir-scribbles-tab-status");
    const title = this.el("span", "sir-scribbles-tab-title");
    select.append(status, title);
    select.addEventListener("click", () => this.tabs.select(chat));
    const close = this.iconButton("x", "Close chat", () => {
      void this.close(chat);
    }, "sir-scribbles-tab-close");
    tab.append(select, close);
    return { pane, panel, tab, select, status, title, close };
  }
  async close(chat) {
    const unsaved = chat.messages.length || chat.draft || chat.selection || chat.file || BUSY.includes(chat.state);
    if (unsaved && !await this.actions.confirmClose(chat)) return;
    if (!await this.tabs.close(chat) && !this.disposed && this.tabs.chats.includes(chat)) {
      this.discard(chat);
      this.render();
    }
  }
  discard(chat) {
    const entry = this.entries.get(chat);
    if (!entry) return;
    entry.panel.dispose();
    entry.pane.remove();
    entry.tab.remove();
    this.entries.delete(chat);
  }
  render() {
    for (const chat of [...this.entries.keys()]) {
      if (!this.tabs.chats.includes(chat)) this.discard(chat);
    }
    for (const chat of this.tabs.chats) {
      let entry = this.entries.get(chat);
      if (!entry) {
        entry = this.entry(chat);
        this.entries.set(chat, entry);
      }
      const active = chat === this.tabs.active;
      const title = chat.title || "New chat";
      entry.title.textContent = title;
      entry.select.title = title;
      entry.status.dataset.state = chat.state;
      entry.select.setAttribute("aria-selected", String(active));
      entry.tab.classList.toggle("is-active", active);
      entry.close.disabled = Boolean(chat.closing);
      entry.pane.hidden = !active;
    }
    this.strip.append(...this.tabs.chats.map((chat) => this.entries.get(chat).tab), this.add);
    this.add.disabled = this.tabs.full;
    this.add.title = this.tabs.full ? `Up to ${this.tabs.limit} chats at once. Close one to start another.` : "New chat";
  }
  // Re-render every chat, for example after the executable path changed.
  renderAll() {
    this.render();
    for (const { panel } of this.entries.values()) panel.render();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.tabs.off("change", this.listener);
    for (const { panel } of this.entries.values()) panel.dispose();
    this.entries.clear();
    this.container.replaceChildren();
  }
};

// src/main.js
var VIEW_TYPE = "sir-scribbles";
function pathKey(app) {
  const adapter = app.vault.adapter;
  return adapter instanceof import_obsidian.FileSystemAdapter ? `sir-scribbles:executable:${adapter.getBasePath()}` : null;
}
function loadPath(app) {
  const key = pathKey(app);
  try {
    const value = key && globalThis.localStorage?.getItem(key);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}
function storePath(app, path) {
  const key = pathKey(app);
  if (!key) throw new Error("Local desktop vault required");
  globalThis.localStorage.setItem(key, path);
}
var CloseModal = class extends import_obsidian.Modal {
  constructor(app, resolve) {
    super(app);
    this.resolve = resolve;
    this.accepted = false;
  }
  onOpen() {
    this.titleEl.textContent = "Close this chat?";
    this.contentEl.createEl("p", { text: "This ends its agent, stops any reply in progress and discards the unsent prompt and selection. The agent keeps its own history, so you may be able to reopen the chat from Open a past chat." });
    new import_obsidian.Setting(this.contentEl).addButton((button) => button.setButtonText("Keep chat").onClick(() => this.close())).addButton((button) => button.setButtonText("Close chat").setCta().onClick(() => {
      this.accepted = true;
      this.close();
    }));
  }
  onClose() {
    this.resolve(this.accepted);
    this.contentEl.empty();
  }
};
var ScribblesView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Sir Scribbles";
  }
  getIcon() {
    return "messages-square";
  }
  async onOpen() {
    if (this.plugin.activeView && this.plugin.activeView !== this) {
      this.leaf.detach();
      return;
    }
    this.plugin.activeView = this;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian.FileSystemAdapter)) {
      this.contentEl.textContent = "Sir Scribbles requires a local desktop vault.";
      return;
    }
    if (this.plugin.cleanupPending) await this.plugin.cleanupPending;
    if (this.closed || this.plugin.unloaded) return;
    const cwd = adapter.getBasePath();
    this.tabs = this.plugin.tabs ?? new ChatTabs(() => new ChatController(cwd, {
      getSourcePath: () => this.plugin.lastEditor?.file?.path ?? ""
    }));
    if (this.tabs.disposed) this.tabs.recover();
    if (!this.tabs.chats.length) this.tabs.add();
    this.plugin.tabs = this.tabs;
    this.panel = new TabbedPanel(this.contentEl, this.tabs, {
      setIcon: import_obsidian.setIcon,
      getPath: () => this.plugin.executablePath,
      savePath: async (path) => {
        await validateExecutable(path);
        await this.plugin.savePath(path);
      },
      attachSelection: () => captureSelection(this.plugin.lastEditor, (view) => view instanceof import_obsidian.MarkdownView && this.app.workspace.getLeavesOfType("markdown").some((leaf) => leaf.view === view)),
      attachFile: () => captureFile(this.plugin.lastEditor, (view) => view instanceof import_obsidian.MarkdownView && this.app.workspace.getLeavesOfType("markdown").some((leaf) => leaf.view === view)),
      confirmClose: () => new Promise((resolve) => new CloseModal(this.app, resolve).open()),
      copyText: (text2) => this.contentEl.ownerDocument.defaultView.navigator.clipboard.writeText(text2),
      openNote: async (target, sourcePath, newLeaf) => {
        if (typeof target === "object") {
          if (target.vault && target.vault !== this.app.vault.getName()) throw new Error("Different vault");
          target = target.path;
        }
        await this.app.workspace.openLinkText(target, sourcePath, newLeaf);
      }
    });
  }
  async onClose() {
    this.closed = true;
    this.panel?.dispose();
    if (this.plugin.activeView !== this) return;
    this.plugin.activeView = null;
    this.plugin.lastEditor = null;
    const tabs = this.tabs;
    if (!tabs) return;
    this.plugin.cleanupPending = tabs.dispose();
    const clean = await this.plugin.cleanupPending;
    if (clean) this.plugin.tabs = null;
    else new import_obsidian.Notice("Agent cleanup could not be confirmed. Reopen Sir Scribbles and force stop before starting another process.", 0);
    this.plugin.cleanupPending = null;
  }
};
var ScribblesSettings = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("p", { text: "macOS developer preview. Install and sign in to your ACP agent in your terminal; Kiro CLI (V3) is currently the only supported agent. Selecting a path does not run it." });
    let path = this.plugin.executablePath;
    const status = this.containerEl.createEl("p", { attr: { role: "status" } });
    new import_obsidian.Setting(this.containerEl).setName("Agent executable").setDesc("Absolute path to the existing CLI executable.").addText((text2) => text2.setPlaceholder("/absolute/path/to/agent").setValue(path).onChange((value) => {
      path = value.trim();
    })).addButton((button) => button.setButtonText("Validate and save").onClick(async () => {
      try {
        await validateExecutable(path);
        await this.plugin.savePath(path);
        status.textContent = "Executable path saved. The agent was not started.";
      } catch {
        status.textContent = "Choose an existing executable using its absolute path.";
      }
    }));
  }
};
var SirScribblesPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.unloaded = false;
    this.shutdownPending = null;
    this.executablePath = loadPath(this.app);
    this.lastEditor = null;
    this.activeView = null;
    this.tabs = null;
    this.cleanupPending = null;
    this.registerView(VIEW_TYPE, (leaf) => new ScribblesView(leaf, this));
    this.addRibbonIcon("messages-square", "Open Sir Scribbles", () => {
      void this.openChat();
    });
    this.addCommand({ id: "open-sir-scribbles", name: "Open Sir Scribbles", callback: () => {
      void this.openChat();
    } });
    this.addSettingTab(new ScribblesSettings(this.app, this));
    this.registerEvent(this.app.workspace.on("quit", (tasks) => {
      tasks.add(() => this.shutdown());
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof import_obsidian.MarkdownView) this.lastEditor = leaf.view;
    }));
    const active = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (active) this.lastEditor = active;
  }
  async savePath(path) {
    storePath(this.app, path);
    this.executablePath = path;
    this.activeView?.panel?.renderAll();
  }
  async openChat() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    if (this.cleanupPending) await this.cleanupPending;
    const active = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (active) this.lastEditor = active;
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      await this.app.workspace.revealLeaf(leaf);
    }
  }
  async shutdown() {
    this.unloaded = true;
    this.activeView?.panel?.dispose();
    this.lastEditor = null;
    if (!this.shutdownPending) this.shutdownPending = (async () => {
      const clean = await (this.cleanupPending ?? this.tabs?.dispose()) ?? true;
      if (!clean) new import_obsidian.Notice("Agent cleanup could not be confirmed on unload. Check the CLI process in your terminal.", 0);
      return clean;
    })();
    return this.shutdownPending;
  }
  onunload() {
    void this.shutdown();
  }
};
/*! Bundled license information:

markdown-it/dist/markdown-it.mjs:
  (*! markdown-it 15.0.2 https://github.com/markdown-it/markdown-it @license MIT *)
*/
