import { isRecord } from './limits.js';

const knownKinds = new Set(['allow_once', 'reject_once', 'allow_always', 'reject_always']);
const consentStrings = ['capability', 'resource', 'triggeringResource', 'workspaceRoot'];

// Kiro documents consent metadata as open-ended and asks clients to preserve
// unknown fields. List it for the approval card instead of cancelling the
// request; while any is present, only one-time choices are offered, so
// metadata this client does not understand can never become a saved rule.
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
//
// "Always" choices are offered only when the agent marks the consent as
// persistable for this exact workspace and names what it covers. The client
// then answers with a workspace-scoped rule for exactly that resource.
export function inspectPermission(params, workspaceRoot = null) {
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
  const unrecognized = unrecognizedMetadata(params._meta);
  const once = params.options.filter(option => ['allow_once', 'reject_once'].includes(option.kind));
  if (!once.length) return { supported: false, reason: 'NO_ONE_TIME_OPTIONS' };
  const consent = params._meta?.kiro?.consent;
  const persistable = !unrecognized.length && isRecord(consent) && consent.persistableConsent === true &&
    typeof consent.capability === 'string' && consent.capability.length > 0 &&
    typeof consent.resource === 'string' && consent.resource.length > 0 &&
    typeof workspaceRoot === 'string' && consent.workspaceRoot === workspaceRoot;
  if (!persistable) return { supported: true, options: once, unrecognized, rule: null };
  // Keep the agent's order so choices appear as offered.
  const options = params.options.filter(option => knownKinds.has(option.kind));
  return { supported: true, options, unrecognized, rule: { capability: consent.capability, resource: consent.resource, workspaceRoot } };
}

export const isPersistent = option => option.kind === 'allow_always' || option.kind === 'reject_always';
export const cancelledPermission = () => ({ outcome: { outcome: 'cancelled' } });
// A persistent choice names its rule: this workspace only, this resource only.
export const selectedPermission = (optionId, rule = null) => rule
  ? { outcome: { outcome: 'selected', optionId }, _meta: { kiro: { consent: { scope: 'workspace', resource: rule.resource, workspaceRoot: rule.workspaceRoot } } } }
  : { outcome: { outcome: 'selected', optionId } };
