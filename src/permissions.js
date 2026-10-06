import { isRecord } from './limits.js';

const knownKinds = new Set(['allow_once', 'reject_once', 'allow_always', 'reject_always']);
const consentKeys = new Set(['capability', 'resource', 'triggeringResource', 'workspaceRoot', 'persistableConsent']);
const capabilities = new Set(['shell', 'read', 'write', 'fs_read', 'fs_write', 'mcp']);

// This is deliberately conservative until actual V3 envelopes are validated.
// Preserve the entire request, including metadata; never authorize from a title.
export function inspectPermission(params) {
  if (!isRecord(params) || typeof params.sessionId !== 'string' || !isRecord(params.toolCall)) {
    return { supported: false, reason: 'INVALID_PERMISSION' };
  }
  const call = params.toolCall;
  if (typeof call.toolCallId !== 'string' || !call.toolCallId ||
      typeof call.title !== 'string' || !call.title ||
      typeof call.kind !== 'string' ||
      !Object.hasOwn(call, 'rawInput') || call.rawInput === null) {
    return { supported: false, reason: 'MISSING_ACTION_DETAILS' };
  }
  if (!Array.isArray(params.options) || !params.options.length) {
    return { supported: false, reason: 'MISSING_OPTIONS' };
  }
  const ids = new Set();
  for (const option of params.options) {
    if (!isRecord(option) || typeof option.optionId !== 'string' || !option.optionId ||
        typeof option.name !== 'string' || !knownKinds.has(option.kind) || ids.has(option.optionId) ||
        Object.keys(option).some(key => !['optionId', 'name', 'kind'].includes(key))) {
      return { supported: false, reason: 'UNKNOWN_OPTION_SEMANTICS' };
    }
    ids.add(option.optionId);
  }
  if (params._meta !== undefined) {
    if (!isRecord(params._meta) || Object.keys(params._meta).some(key => key !== 'kiro')) {
      return { supported: false, reason: 'UNKNOWN_CONSENT_SEMANTICS' };
    }
    const kiro = params._meta.kiro;
    if (!isRecord(kiro) || Object.keys(kiro).some(key => !['consent', 'mcpTool'].includes(key))) {
      return { supported: false, reason: 'UNKNOWN_CONSENT_SEMANTICS' };
    }
    if (kiro.consent !== undefined) {
      const consent = kiro.consent;
      if (!isRecord(consent) || Object.keys(consent).some(key => !consentKeys.has(key)) ||
          (consent.capability !== undefined && !capabilities.has(consent.capability)) ||
          ['resource', 'triggeringResource', 'workspaceRoot'].some(key =>
            consent[key] !== undefined && typeof consent[key] !== 'string') ||
          (consent.persistableConsent !== undefined && typeof consent.persistableConsent !== 'boolean')) {
        return { supported: false, reason: 'UNKNOWN_CONSENT_SEMANTICS' };
      }
    }
    if (kiro.mcpTool !== undefined && (!isRecord(kiro.mcpTool) || kiro.mcpTool.version !== 1)) {
      return { supported: false, reason: 'UNKNOWN_MCP_METADATA' };
    }
  }
  const options = params.options.filter(option => ['allow_once', 'reject_once'].includes(option.kind));
  return options.length
    ? { supported: true, options }
    : { supported: false, reason: 'NO_ONE_TIME_OPTIONS' };
}

export const cancelledPermission = () => ({ outcome: { outcome: 'cancelled' } });
export const selectedPermission = optionId => ({ outcome: { outcome: 'selected', optionId } });
