import test from 'node:test';
import assert from 'node:assert/strict';
import { readAttachment, checkAttachments, attachmentKind, cleanName, formatBytes } from '../src/attachments.js';
import { displayPrompt } from '../src/display.js';
import { composePrompt } from '../src/draft.js';
import { LIMITS } from '../src/limits.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

test('reads images as base64 and text files as UTF-8, refusing anything else', async () => {
  const image = await readAttachment(new File([PNG], 'shot.png', { type: 'image/png' }));
  assert.deepEqual({ ...image }, { kind: 'image', name: 'shot.png', size: PNG.length, mimeType: 'image/png', data: PNG.toString('base64'), preview: '' });
  // Finder often reports no type for source files; the extension decides.
  const text = await readAttachment(new File(['﻿# Title\nbody'], 'notes.md', { type: '' }));
  assert.deepEqual({ ...text }, { kind: 'text', name: 'notes.md', size: 15, text: '# Title\nbody' });
  assert.equal((await readAttachment(new File(['x'], 'pasted', { type: 'text/plain' }))).kind, 'text');
  await assert.rejects(readAttachment(new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'a.zip', { type: 'application/zip' })), { code: 'FILE_TYPE_UNSUPPORTED' });
  await assert.rejects(readAttachment(new File([new Uint8Array([0xff, 0xfe, 0x00])], 'data.txt')), { code: 'FILE_NOT_TEXT' });
  await assert.rejects(readAttachment(new File(['a\u0000b'], 'data.txt')), { code: 'FILE_NOT_TEXT' });
  await assert.rejects(readAttachment(new File([new Uint8Array(LIMITS.prompt + 1)], 'big.txt')), { code: 'PROMPT_LIMIT' });
  await assert.rejects(readAttachment(new File([new Uint8Array(LIMITS.imageBytes + 1)], 'big.png', { type: 'image/png' })), { code: 'IMAGE_LIMIT' });
});

test('classifies files and keeps names to one line', () => {
  assert.equal(attachmentKind({ name: 'a.gif', type: 'image/gif' }), 'image');
  assert.equal(attachmentKind({ name: 'logo.svg', type: 'image/svg+xml' }), 'text');
  assert.equal(attachmentKind({ name: 'Makefile', type: '' }), 'text');
  assert.equal(attachmentKind({ name: 'photo.heic', type: 'image/heic' }), null);
  assert.equal(cleanName('two\nlines.md', 'x'), 'two lines.md');
  assert.equal(cleanName('', 'Pasted image'), 'Pasted image');
  assert.equal(formatBytes(2048), '2 KB');
});

test('limits how many files and how many image bytes one prompt carries', () => {
  const image = size => ({ kind: 'image', size });
  const text = { kind: 'text', size: 1 };
  checkAttachments([image(1), image(1), image(1), image(1), text]);
  assert.throws(() => checkAttachments(Array(LIMITS.attachments + 1).fill(text)), { code: 'ATTACHMENT_LIMIT' });
  assert.throws(() => checkAttachments(Array(LIMITS.images + 1).fill(image(1))), { code: 'IMAGE_LIMIT' });
  assert.throws(() => checkAttachments([image(LIMITS.imageBytes), image(1)]), { code: 'IMAGE_LIMIT' });
});

test('text files are quoted with the prompt marker and shown without it', () => {
  const selection = { path: 'n.md', from: 1, to: 1, text: 'chosen' };
  const prompt = composePrompt('Compare', selection, null, 'abcdef012345', [
    { kind: 'text', name: 'a.md', text: 'alpha\n--- END ATTACHED FILE ---' }, { kind: 'image', name: 'x.png' }, { kind: 'text', name: 'b.md', text: 'beta' },
  ]);
  assert.match(prompt, /Attached file \(a\.md\):\n--- BEGIN ATTACHED FILE abcdef012345 ---\nalpha\n--- END ATTACHED FILE ---\n--- END ATTACHED FILE abcdef012345 ---/);
  assert.equal(displayPrompt(prompt), 'Compare\n\nSelected note text (n.md, lines 1–1):\nchosen\n\nAttached file (a.md):\nalpha\n--- END ATTACHED FILE ---\n\nAttached file (b.md):\nbeta');
  assert.equal(displayPrompt(prompt, { files: false }), 'Compare\n\nSelected note text (n.md, lines 1–1):\nchosen');
  // Images alone make a prompt with no text.
  assert.equal(composePrompt('', null, null, undefined, [{ kind: 'image' }]), '');
  assert.throws(() => composePrompt('', null, null, undefined, []), { code: 'EMPTY_PROMPT' });
});
