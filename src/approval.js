// Browser-safe: turns an approval request into plain language for the card.
// Everything here is display only; the decision still uses the agent's own
// option IDs, and the full request stays available as technical details.

// ACP tool kinds: an icon, a short heading and what the action does.
const KINDS = {
  read: { icon: 'eye', heading: 'Read a file', verb: 'read' },
  edit: { icon: 'pencil', heading: 'Write a file', verb: 'write to' },
  delete: { icon: 'trash-2', heading: 'Delete a file', verb: 'delete' },
  move: { icon: 'folder-input', heading: 'Move a file', verb: 'move' },
  search: { icon: 'search', heading: 'Search files', verb: 'search' },
  execute: { icon: 'terminal', heading: 'Run a command', verb: 'run' },
  fetch: { icon: 'globe', heading: 'Open a web address', verb: 'fetch' },
};
const OTHER = { icon: 'shield-question', heading: 'Use a tool', verb: '' };
// The longest preview shown in the card; the rest is in technical details.
const PREVIEW_CHARS = 4000;
const PREVIEW_LINES = 40;

const text = value => (typeof value === 'string' && value.trim() ? value : '');
// Compared without case, punctuation or small words: "Write File" repeats "Write a file".
const words = value => value.toLowerCase().split(/[^a-z0-9]+/).filter(word => word && !['a', 'an', 'the', 'to'].includes(word)).join(' ');

// Vault paths read better relative; anything else stays absolute and is
// flagged, since the vault directory is context, not a sandbox.
export function describePath(path, vault) {
  const root = vault?.replace(/\/+$/, '');
  if (root && path.startsWith(`${root}/`)) return { label: path.slice(root.length + 1), outside: false };
  if (root && path === root) return { label: 'The vault folder', outside: false };
  // A relative path is relative to the agent's directory, the vault.
  if (!path.startsWith('/') && !/^[a-z]+:/i.test(path)) return { label: path, outside: false };
  return { label: path, outside: true };
}

function preview(label, value) {
  const lines = value.split('\n');
  let shown = lines.slice(0, PREVIEW_LINES).join('\n');
  if (shown.length > PREVIEW_CHARS) shown = shown.slice(0, PREVIEW_CHARS);
  return { label, text: shown, lines: lines.length, truncated: shown.length < value.length };
}

export function describeApproval(toolCall, vault) {
  const kind = KINDS[toolCall.kind] ?? OTHER;
  const input = toolCall.rawInput !== null && typeof toolCall.rawInput === 'object' && !Array.isArray(toolCall.rawInput) ? toolCall.rawInput : {};
  const paths = [];
  const seen = new Set();
  const addPath = path => {
    if (!text(path) || seen.has(path)) return;
    seen.add(path);
    paths.push(describePath(path, vault));
  };
  for (const location of Array.isArray(toolCall.locations) ? toolCall.locations : []) addPath(location?.path);
  for (const key of ['path', 'file_path', 'source', 'destination', 'target']) addPath(input[key]);

  const previews = [];
  const oldText = text(input.old_str) || text(input.old_string);
  const newText = text(input.new_str) || text(input.new_string);
  let heading = kind.heading;
  if (oldText && toolCall.kind === 'edit') {
    heading = 'Edit a file';
    previews.push(preview('Replace', oldText));
    if (newText) previews.push(preview('With', newText));
  } else {
    const content = text(input.text) || text(input.content) || text(input.contents) || text(input.file_text) || newText;
    if (content) previews.push(preview('New content', content));
  }
  const command = text(input.command) ? [input.command, ...(Array.isArray(input.args) ? input.args.filter(arg => typeof arg === 'string') : [])].join(' ') : '';
  if (command) previews.push(preview('Command', command));
  if (text(input.url)) previews.push(preview('Address', input.url));

  const where = paths.length ? (paths.some(path => path.outside) ? ' outside this vault' : ' in this vault') : '';
  const object = { read: 'a file', edit: 'a file', delete: 'a file', move: 'a file', search: 'files', execute: 'a command', fetch: 'a web address' }[toolCall.kind];
  const sentence = kind.verb && object ? `wants to ${kind.verb} ${object}${toolCall.kind === 'execute' || toolCall.kind === 'fetch' ? '' : where}.` : 'wants to use a tool.';
  // The agent's own title adds detail ("Run git status") unless it only
  // repeats the heading ("Write File").
  const title = text(toolCall.title);
  const detail = title && words(title) !== words(heading) && words(title) !== words(kind.heading) ? title : '';
  return {
    icon: kind.icon, heading, detail, sentence, paths, previews,
    cwd: text(input.cwd) && command ? describePath(input.cwd, vault) : null,
    // Nothing concrete to show: the card says so and points at the details.
    vague: !paths.length && !previews.length,
  };
}
