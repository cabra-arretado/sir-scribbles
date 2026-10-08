import test from 'node:test';
import assert from 'node:assert/strict';
import { describeApproval, describePath } from '../src/approval.js';

const vault = '/Users/you/notes';

test('a Kiro file write reads as plain language with the vault path and content', () => {
  const action = describeApproval({
    toolCallId: 't', title: 'Write File', kind: 'edit', status: 'pending',
    rawInput: { path: `${vault}/TaskNotes/Views/kanban-native.base`, text: 'filters:\n  and:\n    - file.hasTag("task")\n' },
    locations: [{ path: `${vault}/TaskNotes/Views/kanban-native.base` }],
  }, vault);
  assert.equal(action.heading, 'Write a file');
  assert.equal(action.sentence, 'wants to write to a file in this vault.');
  assert.equal(action.detail, '', 'the agent title only repeats the heading');
  assert.deepEqual(action.paths, [{ label: 'TaskNotes/Views/kanban-native.base', outside: false }]);
  assert.deepEqual(action.previews, [{ label: 'New content', text: 'filters:\n  and:\n    - file.hasTag("task")\n', lines: 4, truncated: false }]);
  assert.equal(action.vague, false);
});

test('paths outside the vault are flagged', () => {
  assert.deepEqual(describePath('/etc/hosts', vault), { label: '/etc/hosts', outside: true });
  assert.deepEqual(describePath(`${vault}-other/a.md`, vault), { label: `${vault}-other/a.md`, outside: true });
  assert.deepEqual(describePath('relative/a.md', vault), { label: 'relative/a.md', outside: false });
  const action = describeApproval({ kind: 'delete', locations: [{ path: '/etc/hosts' }] }, vault);
  assert.equal(action.sentence, 'wants to delete a file outside this vault.');
});

test('replacements, commands and vague requests', () => {
  const edit = describeApproval({ kind: 'edit', title: 'Replace in file', rawInput: { path: `${vault}/a.md`, old_str: 'old', new_str: 'new' } }, vault);
  assert.equal(edit.heading, 'Edit a file');
  assert.equal(edit.detail, 'Replace in file');
  assert.deepEqual(edit.previews.map(block => [block.label, block.text]), [['Replace', 'old'], ['With', 'new']]);
  const run = describeApproval({ kind: 'execute', title: 'Run git status', rawInput: { command: 'git', args: ['status', '--short'], cwd: vault } }, vault);
  assert.equal(run.sentence, 'wants to run a command.');
  assert.deepEqual(run.previews.map(block => block.text), ['git status --short']);
  assert.equal(run.cwd.label, 'The vault folder');
  const vague = describeApproval({ toolCallId: 'x' }, vault);
  assert.equal(vague.heading, 'Use a tool');
  assert.equal(vague.vague, true);
});

test('long content is shortened in the card only', () => {
  const text = Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n');
  const [block] = describeApproval({ kind: 'edit', rawInput: { path: 'a.md', content: text } }, vault).previews;
  assert.equal(block.lines, 100);
  assert.equal(block.text.split('\n').length, 40);
  assert.equal(block.truncated, true);
});
