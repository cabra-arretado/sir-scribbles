import { LIMITS, OperationalError } from './limits.js';

// Browser-safe: the panel reads pasted, dropped and picked files here, so it
// must not pull in Node modules. Images become ACP image blocks; text files are
// quoted into the prompt like a selection. Anything else is refused.
export const IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const TEXT_TYPES = new Set(['application/json', 'application/xml', 'application/javascript', 'application/x-yaml', 'application/yaml', 'application/toml', 'application/x-sh', 'image/svg+xml']);
const TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'txt', 'text', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'xml', 'svg',
  'html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts',
  'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'pl', 'lua', 'r', 'sql', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'tex', 'bib',
  'org', 'rst', 'adoc', 'diff', 'patch', 'gitignore', 'dockerfile', 'makefile', 'gradle', 'graphql', 'proto',
]);
// Longest edge sent to the agent. Larger images are scaled down before
// encoding; providers downscale anyway, and this keeps the frame small.
const MAX_EDGE = 2048;
const THUMB_EDGE = 160;
export const ACCEPT = [...IMAGE_TYPES, 'text/*', ...TEXT_TYPES, ...[...TEXT_EXTENSIONS].map(extension => `.${extension}`)].join(',');

const extensionOf = name => (name.includes('.') ? name.split('.').pop() : name).toLowerCase();
// A file name is shown and quoted in the prompt label; keep it one line.
export const cleanName = (name, fallback) => (typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : '').slice(0, 200) || fallback;

export function attachmentKind(file) {
  const type = (file.type || '').toLowerCase();
  if (IMAGE_TYPES.includes(type)) return 'image';
  if (type.startsWith('text/') || TEXT_TYPES.has(type) || TEXT_EXTENSIONS.has(extensionOf(file.name || ''))) return 'text';
  return null;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

// Draws an image onto a canvas at most `edge` pixels on its longest side.
// Returns null where the host cannot decode or draw images (tests, very old
// engines); the original file is then sent as it is.
async function draw(source, edge) {
  const view = globalThis;
  if (typeof view.createImageBitmap !== 'function' || typeof view.document?.createElement !== 'function') return null;
  let bitmap;
  try { bitmap = await view.createImageBitmap(source); }
  catch { return null; }
  try {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = view.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { canvas, context, scaled: scale < 1 };
  } finally { bitmap.close?.(); }
}
const encode = (canvas, type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));

// JPEG has no alpha channel: encoding a canvas flattens transparent pixels to
// black, so black lines on a transparent diagram would vanish. Images with any
// transparency stay PNG. If the pixels cannot be read, assume transparency.
export function hasTransparency({ canvas, context }) {
  let data;
  try { ({ data } = context.getImageData(0, 0, canvas.width, canvas.height)); }
  catch { return true; }
  for (let index = 3; index < data.length; index += 4) if (data[index] < 255) return true;
  return false;
}

async function readImage(file, name) {
  if (file.size > LIMITS.imageSource) throw new OperationalError('IMAGE_LIMIT');
  let blob = file;
  let mimeType = file.type.toLowerCase();
  // Animated GIFs would lose their frames; send them as they are.
  const drawn = mimeType === 'image/gif' ? null : await draw(file, MAX_EDGE);
  if (drawn) {
    const transparent = mimeType !== 'image/jpeg' && hasTransparency(drawn);
    if (drawn.scaled) {
      const scaled = await encode(drawn.canvas, mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9);
      if (scaled) { blob = scaled; mimeType = scaled.type || mimeType; }
    }
    // A detailed opaque PNG, like a Retina screenshot, can stay megabytes
    // large; a high-quality JPEG is usually a fraction of that, so several fit.
    if (!transparent && blob.size > LIMITS.imageBytes / 4) {
      const smaller = await encode(drawn.canvas, 'image/jpeg', 0.9);
      if (smaller && smaller.size < blob.size) { blob = smaller; mimeType = 'image/jpeg'; }
    }
  }
  if (blob.size > LIMITS.imageBytes) throw new OperationalError('IMAGE_LIMIT');
  const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
  const thumb = await draw(blob, THUMB_EDGE);
  const thumbBlob = thumb && await encode(thumb.canvas, hasTransparency(thumb) ? 'image/png' : 'image/jpeg', 0.8);
  const preview = thumbBlob ? `data:${thumbBlob.type};base64,${toBase64(new Uint8Array(await thumbBlob.arrayBuffer()))}` : '';
  return Object.freeze({ kind: 'image', name, size: blob.size, mimeType, data, preview });
}

async function readText(file, name) {
  if (file.size > LIMITS.prompt) throw new OperationalError('PROMPT_LIMIT');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new OperationalError('FILE_NOT_TEXT'); }
  if (text.includes('\u0000')) throw new OperationalError('FILE_NOT_TEXT');
  return Object.freeze({ kind: 'text', name, size: file.size, text: text.replace(/^﻿/, '') });
}

export async function readAttachment(file) {
  const kind = attachmentKind(file);
  if (!kind) throw new OperationalError('FILE_TYPE_UNSUPPORTED');
  try {
    if (kind === 'image') return await readImage(file, cleanName(file.name, 'Pasted image'));
    return await readText(file, cleanName(file.name, 'Pasted text'));
  } catch (error) {
    throw error instanceof OperationalError ? error : new OperationalError('FILE_UNREADABLE');
  }
}

// Counts and sizes that apply to the whole set, checked as files are added.
export function checkAttachments(attachments) {
  if (attachments.length > LIMITS.attachments) throw new OperationalError('ATTACHMENT_LIMIT');
  const images = attachments.filter(item => item.kind === 'image');
  if (images.length > LIMITS.images || images.reduce((total, item) => total + item.size, 0) > LIMITS.imageBytes) {
    throw new OperationalError('IMAGE_LIMIT');
  }
}
