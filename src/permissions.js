import { isRecord } from './limits.js';

const knownKinds = new Set(['allow_once', 'reject_once', 'allow_always', 'reject_always']);
const consentStrings = ['capability', 'resource', 'triggeringResource', 'workspaceRoot'];

// Kiro documents consent metadata as open-ended and asks clients to preserve
// unknown fields. This client only ever replies with a one-time option and never
// returns consent metadata, so unrecognized metadata cannot widen a decision.
// List it for the approval card instead of cancelling the request.
function unrecognizedMetadata(meta) {
  if (meta === undefined) return [];
  if (!isRecord(meta)) return ['_meta'];
  const found = Object.keys(meta).filter(key => key !== 'kiro').map(key => `_meta.${key}`);
  const kiro = meta.kiro;
  if (kiro === undefined) return found;
  if (!isRecord(kiro)) return [...found, '_meta.kiro'];
  found.push(...Object.keys(kiro).filter(key => !['consent', 'mcpTool'].includes(key)).map(key => `_meta.kiro.${key}`));
  const consent = kiro.consent;
  if (consent !== undefined && !isRecord(consent)) found.push('_meta.kiro.consent');
  else if (consent !== undefined) {
    for (const key of Object.keys(consent)) {
      const known = consentStrings.includes(key) ? typeof consent[key] === 'string'
        : key === 'persistableConsent' && typeof consent[key] === 'boolean';
      if (!known) found.push(`_meta.kiro.consent.${key}`);
    }
  }
  if (kiro.mcpTool !== undefined && (!isRecord(kiro.mcpTool) || kiro.mcpTool.version !== 1)) found.push('_meta.kiro.mcpTool');
  return found;
}

// ACP permission tool calls are partial updates. Missing descriptive fields
// must not suppress the user's decision; preserve metadata and offered IDs.
// Option semantics stay strict: they define what the user's click means.
export function inspectPermission(params) {
  if (!isRecord(params) || typeof params.sessionId !== 'string' || !isRecord(params.toolCall)) {
    return { supported: false, reason: 'INVALID_PERMISSION' };
  }
  const call = params.toolCall;
  if (typeof call.toolCallId !== 'string' || !call.toolCallId ||
      (call.title != null && typeof call.title !== 'string') ||
      (call.kind != null && typeof call.kind !== 'string')) {
    return { supported: false, reason: 'INVALID_ACTION_DETAILS' };
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
  const options = params.options.filter(option => ['allow_once', 'reject_once'].includes(option.kind));
  return options.length
    ? { supported: true, options, unrecognized: unrecognizedMetadata(params._meta) }
    : { supported: false, reason: 'NO_ONE_TIME_OPTIONS' };
}

export const cancelledPermission = () => ({ outcome: { outcome: 'cancelled' } });
export const selectedPermission = optionId => ({ outcome: { outcome: 'selected', optionId } });
