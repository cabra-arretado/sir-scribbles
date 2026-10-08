import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPermission } from '../src/permissions.js';

const request = () => ({
  sessionId: 's',
  toolCall: { toolCallId: 't', title: 'Do a thing', kind: 'execute', rawInput: { args: ['a b', 'c'] }, locations: [{ path: '/sensitive' }] },
  options: [
    { optionId: 'one', name: 'Go', kind: 'allow_once' },
    { optionId: 'all', name: 'Always', kind: 'allow_always' },
    { optionId: 'no', name: 'No', kind: 'reject_once' },
  ],
});

test('offers only actual one-time IDs and preserves full request', () => {
  const params = request();
  const original = structuredClone(params);
  const inspected = inspectPermission(params, '/fixture');
  assert.deepEqual(inspected.options.map(option => option.optionId), ['one', 'no']);
  assert.equal(inspected.rule, null);
  assert.deepEqual(params, original);
});

test('always choices need consent for this workspace and a named resource', () => {
  const persistable = () => ({ ...request(), _meta: { kiro: { consent: { capability: 'shell', resource: 'npm test', workspaceRoot: '/fixture', persistableConsent: true } } } });
  const inspected = inspectPermission(persistable(), '/fixture');
  assert.deepEqual(inspected.options.map(option => option.optionId), ['one', 'all', 'no']);
  assert.deepEqual(inspected.rule, { capability: 'shell', resource: 'npm test', workspaceRoot: '/fixture' });
  const variants = [
    params => { params._meta.kiro.consent.persistableConsent = false; },
    params => { delete params._meta.kiro.consent.resource; },
    params => { delete params._meta.kiro.consent.capability; },
    params => { params._meta.kiro.consent.workspaceRoot = '/other'; },
    params => { params._meta.kiro.consent.scope = 'user'; }, // Unrecognized metadata: never saved.
    params => { params._meta.kiroExtra = true; },
  ];
  for (const change of variants) {
    const params = persistable();
    change(params);
    const result = inspectPermission(params, '/fixture');
    assert.equal(result.rule, null);
    assert.deepEqual(result.options.map(option => option.optionId), ['one', 'no']);
  }
  assert.equal(inspectPermission(persistable()).rule, null, 'no workspace, no rule');
});

test('a real Kiro V3 request offers its always choices', () => {
  // As Kiro sends it: no persistableConsent, plus descriptive fields.
  const params = { ...request(), _meta: { kiro: { toolId: 'fs_write', consentRound: 1,
    consent: { capability: 'fs_write', resource: 'TaskNotes/Views/kanban-native.base', askType: 'implicit', workspaceRoot: '/fixture' } } } };
  const inspected = inspectPermission(params, '/fixture');
  assert.deepEqual(inspected.unrecognized, []);
  assert.deepEqual(inspected.options.map(option => option.optionId), ['one', 'all', 'no']);
  assert.deepEqual(inspected.rule, { capability: 'fs_write', resource: 'TaskNotes/Views/kanban-native.base', workspaceRoot: '/fixture' });
  // Wrong types are still unrecognized and keep choices one-time.
  params._meta.kiro.consentRound = '1';
  assert.deepEqual(inspectPermission(params, '/fixture').unrecognized, ['_meta.kiro.consentRound']);
  assert.equal(inspectPermission(params, '/fixture').rule, null);
});

test('partial tool details are supported but a tool ID is required', () => {
  for (const key of ['rawInput', 'title', 'kind']) {
    const params = request();
    delete params.toolCall[key];
    assert.equal(inspectPermission(params).supported, true);
  }
  const params = request();
  delete params.toolCall.toolCallId;
  assert.equal(inspectPermission(params).supported, false);
});

test('persistent-only, duplicate, unknown and extended options are unsupported', () => {
  const cases = [
    [{ optionId: 'all', name: 'All', kind: 'allow_always' }],
    [{ optionId: 'one', name: 'Go', kind: 'allow_once' }, { optionId: 'one', name: 'No', kind: 'reject_once' }],
    [{ optionId: 'one', name: 'Go', kind: 'unknown' }],
    [{ optionId: 'one', name: 'Go', kind: 'allow_once', scope: 'forever' }],
  ];
  for (const options of cases) assert.equal(inspectPermission({ ...request(), options }).supported, false);
});

test('known consent is preserved; unknown metadata is listed, never cancelled', () => {
  const params = request();
  params._meta = { kiro: { consent: { capability: 'shell', workspaceRoot: '/fixture', persistableConsent: true } } };
  assert.deepEqual(inspectPermission(params).unrecognized, []);
  // Capabilities are open-ended, e.g. a replace-in-file edit.
  params._meta.kiro.consent.capability = 'str_replace';
  assert.deepEqual(inspectPermission(params).unrecognized, []);
  params._meta.kiro.consent.scope = 'global';
  params._meta.kiro.consent.persistableConsent = 'yes';
  params._meta.kiro.mcpTool = { version: 2 };
  params._meta.trustOptions = ['all'];
  const inspected = inspectPermission(params);
  assert.equal(inspected.supported, true);
  assert.deepEqual(inspected.options.map(option => option.kind), ['allow_once', 'reject_once']);
  assert.deepEqual(inspected.unrecognized.sort(), ['_meta.kiro.consent.persistableConsent', '_meta.kiro.consent.scope', '_meta.kiro.mcpTool', '_meta.trustOptions']);
});

test('resources with pattern syntax get one-time choices only, since Kiro would widen them', () => {
  for (const resource of ['ls *.md', '/vault/{a,b}.md', '/vault/[ab].md', '/vault/a?.md', 'C:\\vault']) {
    const params = { ...request(), _meta: { kiro: { consent: { capability: 'shell', resource, workspaceRoot: '/fixture', persistableConsent: true } } } };
    const inspected = inspectPermission(params, '/fixture');
    assert.equal(inspected.rule, null, resource);
    assert.deepEqual(inspected.options.map(option => option.kind), ['allow_once', 'reject_once']);
  }
});
