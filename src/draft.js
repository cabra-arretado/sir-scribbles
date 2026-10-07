import { randomBytes } from 'node:crypto';
import { LIMITS, OperationalError } from './limits.js';

export function captureSelection(view, eligible) {
  if (!view || !eligible(view) || !view.file || view.file.extension !== 'md' || !view.editor) {
    throw new OperationalError('SELECT_TEXT_FIRST');
  }
  const text = view.editor.getSelection();
  if (!text) throw new OperationalError('SELECT_TEXT_FIRST');
  const from = view.editor.getCursor('from');
  const to = view.editor.getCursor('to');
  const path = view.file.path;
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..')) {
    throw new OperationalError('INVALID_SELECTION_SOURCE');
  }
  const snapshot = Object.freeze({
    path, from: from.line + 1,
    to: Math.max(from.line + 1, to.line + (to.ch > 0 ? 1 : 0)), text,
  });
  composePrompt('', snapshot); // Reject oversize without truncation or replacing the current draft.
  return snapshot;
}

export function captureFile(view, eligible) {
  if (!view || !eligible(view) || !view.file || view.file.extension !== 'md' || !view.editor) {
    throw new OperationalError('OPEN_NOTE_FIRST');
  }
  const path = view.file.path;
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..')) {
    throw new OperationalError('INVALID_SELECTION_SOURCE');
  }
  const snapshot = Object.freeze({ kind: 'file', path });
  composePrompt('', snapshot);
  return snapshot;
}

// Note text cannot know a per-prompt marker in advance, so it cannot close the
// quoted block early and continue as if the user had written the rest.
const selectionMarker = () => randomBytes(6).toString('hex');

export function composePrompt(text, selection, file = null, marker = selectionMarker()) {
  const parts = [];
  if (text.trim()) parts.push(text);
  if (file) parts.push(`Attached note path: ${file.path}`);
  if (selection?.kind === 'file') parts.push(`Attached note path: ${selection.path}`);
  else if (selection) parts.push(`Selected note text (${selection.path}, lines ${selection.from}–${selection.to}):\n--- BEGIN SELECTED TEXT ${marker} ---\n${selection.text}\n--- END SELECTED TEXT ${marker} ---`);
  const prompt = parts.join('\n\n');
  if (!prompt) throw new OperationalError('EMPTY_PROMPT');
  if (Buffer.byteLength(prompt, 'utf8') > LIMITS.prompt) throw new OperationalError('PROMPT_LIMIT');
  return prompt;
}
