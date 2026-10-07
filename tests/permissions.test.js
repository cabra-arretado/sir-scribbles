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
  assert.deepEqual(inspectPermission(params).options.map(option => option.optionId), ['one', 'no']);
  assert.deepEqual(params, original);
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
