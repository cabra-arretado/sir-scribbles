import { ChatPanel } from '../src/panel.js';

// Development-only UI fixtures. Not bundled into the Obsidian plugin.
class Fixture {
  constructor() { this.listeners = new Set(); this.cwd = '/Users/you/Notes/Studio'; this.state = 'not-started'; this.messages = []; this.draft = ''; this.selection = null; this.file = null; this.identity = ''; this.error = ''; this.session = { permissions: new Map() }; }
  on(event, fn) { this.listeners.add(fn); }
  off(event, fn) { this.listeners.delete(fn); }
  changed() { for (const fn of this.listeners) fn(); }
  setDraft(text) { this.draft = text; }
  attach(selection) { if (selection.kind === 'file') this.file = selection; else this.selection = selection; this.changed(); }
  removeFile() { this.file = null; this.changed(); }
  removeSelection() { this.selection = null; this.changed(); }
  activePermission() { return this.session.permissions.values().next().value ?? null; }
  setError() { this.error = 'Preview only. No agent executable is launched.'; this.changed(); }
  start() { this.state = 'ready'; this.identity = 'Agent · UI fixture'; this.changed(); }
  newChat() { this.state = 'not-started'; this.messages = []; this.draft = ''; this.selection = null; this.file = null; this.session.permissions.clear(); this.changed(); }
  send() { this.messages.push({ role: 'user', text: this.draft || this.selection?.text || '' }, { role: 'agent', text: 'This is an interactive UI preview. The actual plugin sends this prompt to your local agent process.' }); this.draft = ''; this.selection = null; this.file = null; this.changed(); }
  decide(card, optionId) { this.session.permissions.clear(); this.state = 'ready'; this.messages.push({ role: 'agent', text: optionId === 'allow' ? 'Fixture approval selected. No file was written.' : 'Fixture denial selected. No file was written.' }); this.changed(); }
  stop() { this.session.permissions.clear(); this.state = 'ready'; this.changed(); }
}
// Stand-in for Obsidian's setIcon with the few Lucide icons the panel uses.
const ICONS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  square: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};
const setIcon = (node, name) => { node.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`; };
const model = new Fixture();
const selection = { path: 'Projects/Launch notes.md', from: 7, to: 7, text: 'Give the user a clear starting point, let them choose the context, and keep every action visible.' };
const panel = new ChatPanel(document.getElementById('panel'), model, {
  setIcon,
  getPath: () => '/Users/you/.local/bin/agent', savePath: async () => {}, attachSelection: () => selection,
  attachFile: () => ({ kind: 'file', path: selection.path }),
  openNote: target => { model.error = `Preview note link: ${typeof target === 'string' ? target : target.path}. No vault is open in this fixture.`; model.changed(); },
  confirmReset: async () => window.confirm('Discard this preview chat?'), copyText: text => navigator.clipboard.writeText(text),
});
document.getElementById('initial').onclick = () => model.newChat();
document.getElementById('conversation').onclick = () => {
  model.newChat(); model.start();
  model.messages = [{ role: 'user', text: 'Help me turn this into a concise product principle.' }, { role: 'tool', text: '{"path":"Projects/Launch notes.md"}', data: { title: 'Read Launch notes.md', status: 'completed' } }, { role: 'agent', text: '## Keep the user in the loop\n\n- **Start deliberately.** Keep every action visible.\n- **Share context explicitly.** Attach only what helps.\n- **Review the result.** Keep the conversation close to your notes.\n\nSee [[Projects/Launch notes|Launch notes]].\n\nUse `Shift + Enter` for a newline.\n\n```js\nconst principle = "Keep the user in the loop";\n```' }];
  model.selection = selection; model.draft = 'What would this look like in practice?'; model.changed();
};
document.getElementById('approval').onclick = () => {
  model.newChat(); model.start(); model.state = 'waiting-for-approval';
  model.messages = [{ role: 'user', text: 'Save that principle to a new note.' }, { role: 'agent', text: 'I can create a short note. Please review the exact action below.' }];
  model.session.permissions.set(1, { id: 1, params: { sessionId: 'preview', toolCall: { toolCallId: 'write-1', title: 'Create Product principle.md', kind: 'edit', locations: [{ path: '/Users/you/Notes/Studio/Product principle.md' }], rawInput: { path: '/Users/you/Notes/Studio/Product principle.md', contents: 'Keep the user in the loop.\nStart deliberately. Share context explicitly. Review every action.' } }, _meta: { kiro: { consent: { capability: 'fs_write', workspaceRoot: model.cwd } } } }, options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }, { optionId: 'deny', name: 'Deny', kind: 'reject_once' }] });
  model.changed();
};
