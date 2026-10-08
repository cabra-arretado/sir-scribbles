// Browser-safe: the panel imports this, so it must not pull in Node modules.
// The markers are for the agent; show the user the quoted text without them.
// Each block ends at the END line carrying its own random marker, which quoted
// text cannot know in advance.
const QUOTED = /\n--- BEGIN (SELECTED TEXT|ATTACHED FILE) ([0-9a-f]{12}) ---\n([\s\S]*?)\n--- END \1 \2 ---(?=\n\n|$)/g;
const FILE_BLOCK = /(?:^|\n\n)Attached file \([^\n]*\):\n--- BEGIN ATTACHED FILE ([0-9a-f]{12}) ---\n[\s\S]*?\n--- END ATTACHED FILE \1 ---(?=\n\n|$)/g;

// With `files: false`, attached file contents are left out: the transcript
// shows those files as chips instead. Copy keeps them.
export function displayPrompt(prompt, { files = true } = {}) {
  const text = files ? prompt : prompt.replace(FILE_BLOCK, '');
  return text.replace(QUOTED, '\n$3');
}

// What a tool call is about, verbatim from its input: the query of a web
// search, or the address of a fetch.
export function toolSubject(data) {
  const input = data?.rawInput;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return '';
  const found = key => typeof input[key] === 'string' && input[key].trim() ? input[key].trim() : '';
  const query = found('query');
  return query ? `“${query}”` : found('url');
}
