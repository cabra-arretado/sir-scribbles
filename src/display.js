// Browser-safe: the panel imports this, so it must not pull in Node modules.
// The markers are for the agent; show the user the quoted text without them.
export function displayPrompt(prompt) {
  return prompt.replace(/\n--- BEGIN SELECTED TEXT ([0-9a-f]{12}) ---\n([\s\S]*)\n--- END SELECTED TEXT \1 ---$/, '\n$2');
}
