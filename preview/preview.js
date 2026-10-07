import { ChatTabs, TabbedPanel } from '../src/tabs.js';

// Development-only UI fixtures. Not bundled into the Obsidian plugin.
class Fixture {
  constructor() { this.title = ''; this.history = null; this.loading = false; this.listeners = new Set(); this.cwd = '/Users/you/Notes/Studio'; this.state = 'not-started'; this.messages = []; this.draft = ''; this.selection = null; this.file = null; this.identity = ''; this.error = ''; this.configOptions = []; this.configPending = false; this.session = { permissions: new Map() }; }
  on(event, fn) { this.listeners.add(fn); }
  removeAllListeners() { this.listeners.clear(); }
  async dispose() { this.removeAllListeners(); return true; }
  recoverCleanup() {}
  off(event, fn) { this.listeners.delete(fn); }
  changed() { for (const fn of this.listeners) fn(); }
  setDraft(text) { this.draft = text; }
  attach(selection) { if (selection.kind === 'file') this.file = selection; else this.selection = selection; this.changed(); }
  removeFile() { this.file = null; this.changed(); }
  removeSelection() { this.selection = null; this.changed(); }
  activePermission() { return this.session.permissions.values().next().value ?? null; }
  setError() { this.error = 'Preview only. No agent executable is launched.'; this.changed(); }
  modelOption() { return this.configOptions.find(option => option.category === 'model') ?? null; }
  setModel(value) {
    // Mimic the round trip: the agent replies with the full option list.
    this.configPending = true; this.changed();
    setTimeout(() => { this.configOptions = models(value); this.configPending = false; this.changed(); }, 400);
  }
  browse() {
    this.state = 'connected'; this.identity = 'Agent · UI fixture'; this.history = { pending: true }; this.changed();
    setTimeout(() => { this.history = { entries: PAST }; this.changed(); }, 500);
  }
  open(sessionId, title) {
    this.history = null;
    if (!sessionId) { this.start(); return; }
    this.title = title; this.messages = [{ role: 'user', text: 'Draft three options for the launch announcement.', timestamp: null }, { role: 'agent', text: 'Here are three directions:\n\n1. **Quiet confidence** — lead with the problem.\n2. **Show, don\'t tell** — a short demo clip.\n3. **Founder note** — why we built it.', timestamp: null }];
    this.start();
  }
  start() { this.state = 'ready'; this.identity = 'Agent · UI fixture'; this.configOptions = models('auto'); this.changed(); }
  newChat() { this.title = ''; this.history = null; this.state = 'not-started'; this.configOptions = []; this.messages = []; this.draft = ''; this.selection = null; this.file = null; this.session.permissions.clear(); this.changed(); }
  send() {
    if (this.state === 'connected') this.start();
    if (!this.title) this.title = (this.draft || 'Selection').split('\n')[0].slice(0, 48);
    this.messages.push({ role: 'user', text: this.draft || this.selection?.text || '' });
    this.draft = ''; this.selection = null; this.file = null; this.state = 'working'; this.changed();
    // Replay a reply in uneven bursts, the way a real agent streams.
    const reply = { role: 'agent', text: '', timestamp: Date.now() };
    let at = 0;
    const burst = () => {
      if (!at) this.messages.push(reply);
      const size = 4 + Math.floor(Math.random() * 60);
      reply.text += STREAM.slice(at, at + size); at += size;
      if (at < STREAM.length) setTimeout(burst, 40 + Math.random() * 260);
      else this.state = 'ready';
      this.changed();
    };
    setTimeout(burst, 600);
  }
  decide(card, optionId) { this.session.permissions.clear(); this.state = 'ready'; this.messages.push({ role: 'agent', text: optionId === 'allow' ? 'Fixture approval selected. No file was written.' : 'Fixture denial selected. No file was written.' }); this.changed(); }
  stop() { this.session.permissions.clear(); this.state = 'ready'; this.changed(); }
}
const PAST = [
  { sessionId: 'a', title: 'Launch announcement options', updatedAt: Date.now() - 36e5 * 5 },
  { sessionId: 'b', title: 'Summarize research interviews', updatedAt: Date.now() - 864e5 * 3 },
  { sessionId: 'c', title: '', updatedAt: Date.now() - 864e5 * 20 },
];
const models = current => [{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: current, options: [
  { value: 'auto', name: 'Auto', description: 'Picks a model for each task' },
  { value: 'claude-sonnet', name: 'Claude Sonnet', group: 'Claude' },
  { value: 'claude-opus', name: 'Claude Opus', group: 'Claude' },
  { value: 'claude-haiku', name: 'Claude Haiku', group: 'Claude' },
] }];
const STREAM = 'This is an interactive UI preview. In the plugin, your prompt goes to the **local agent process** and its reply streams back in uneven bursts.\n\n## What you are seeing\n\n- Text eases in at a pace that follows the *backlog*, not each burst.\n- Unfinished `inline code`, **bold** and [links](https://example.com) never flash as raw syntax.\n- Earlier paragraphs stay put while the tail grows.\n\n```js\nconst principle = "Keep the user in the loop";\n```\n\nSee [[Projects/Launch notes|Launch notes]] for the original.';
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
const tabs = new ChatTabs(() => new Fixture());
tabs.add();
let model = tabs.active;
tabs.on('change', () => { model = tabs.active; });
const selection = { path: 'Projects/Launch notes.md', from: 7, to: 7, text: 'Give the user a clear starting point, let them choose the context, and keep every action visible.' };
const panel = new TabbedPanel(document.getElementById('panel'), tabs, {
  setIcon,
  getPath: () => '/Users/you/.local/bin/agent', savePath: async () => {}, attachSelection: () => selection,
  attachFile: () => ({ kind: 'file', path: selection.path }),
  openNote: target => { model.error = `Preview note link: ${typeof target === 'string' ? target : target.path}. No vault is open in this fixture.`; model.changed(); },
  confirmClose: async () => window.confirm('Close this preview chat?'), copyText: text => navigator.clipboard.writeText(text),
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
