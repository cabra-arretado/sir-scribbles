import { ChatTabs, TabbedPanel } from '../src/tabs.js';

// Development-only UI fixtures. Not bundled into the Obsidian plugin.
class Fixture {
  constructor() { this.title = ''; this.history = null; this.loading = false; this.listeners = new Set(); this.cwd = '/Users/you/Notes/Studio'; this.state = 'not-started'; this.messages = []; this.draft = ''; this.selection = null; this.file = null; this.attachments = []; this.identity = ''; this.error = ''; this.configOptions = []; this.configPending = false; this.session = { permissions: new Map() }; }
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
  addAttachments(items) { this.attachments = [...this.attachments, ...items]; this.error = ''; this.changed(); }
  removeAttachment(item) { this.attachments = this.attachments.filter(entry => entry !== item); this.changed(); }
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
  start(executable, { listPast = false } = {}) {
    this.state = 'ready'; this.identity = 'Agent · UI fixture'; this.configOptions = models('auto'); this.changed();
    if (listPast) setTimeout(() => { if (!this.messages.length) { this.recent = { entries: PAST }; this.changed(); } }, 500);
  }
  reopen(executable, sessionId, title) { this.recent = null; this.state = 'connected'; this.open(sessionId, title); }
  newChat() { this.title = ''; this.history = null; this.recent = null; this.state = 'not-started'; this.configOptions = []; this.messages = []; this.draft = ''; this.selection = null; this.file = null; this.attachments = []; this.session.permissions.clear(); this.changed(); }
  send() {
    if (this.state === 'connected') this.start();
    if (!this.title) this.title = (this.draft || 'Selection').split('\n')[0].slice(0, 48);
    this.messages.push({ role: 'user', text: this.draft || this.selection?.text || '', attachments: this.attachments.map(({ kind, name, size, preview }) => ({ kind, name, size, preview })) });
    this.draft = ''; this.selection = null; this.file = null; this.attachments = []; this.state = 'working'; this.changed();
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
  decide(card, optionId) { this.session.permissions.clear(); this.state = 'ready'; this.messages.push({ role: 'agent', text: optionId.endsWith('allow') ? 'Fixture approval selected. No file was written.' : 'Fixture denial selected. No file was written.' }); this.changed(); }
  stop() { this.session.permissions.clear(); this.state = 'ready'; this.changed(); }
}
const PAST = [
  { sessionId: 'a', title: 'Launch announcement options', updatedAt: Date.now() - 36e5 * 5 },
  { sessionId: 'b', title: 'Summarize research interviews', updatedAt: Date.now() - 864e5 * 3 },
  { sessionId: 'c', title: '', updatedAt: Date.now() - 864e5 * 20 },
  ...Array.from({ length: 17 }, (_, i) => ({ sessionId: `old-${i}`, title: `Older chat ${i + 1}`, updatedAt: Date.now() - 864e5 * (25 + i * 4) })),
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
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
};
const setIcon = (node, name) => { node.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`; };
// A tiny locally drawn thumbnail; the fixture loads no remote images.
const SWATCH = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#2b2f3a"/><rect x="6" y="8" width="48" height="6" rx="2" fill="#7c5ce0"/><rect x="6" y="20" width="34" height="4" rx="2" fill="#808080"/><rect x="6" y="28" width="40" height="4" rx="2" fill="#808080"/><rect x="6" y="40" width="22" height="12" rx="2" fill="#44cf6e"/></svg>');
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
  model.selection = selection; model.draft = 'What would this look like in practice?';
  model.attachments = [{ kind: 'image', name: 'Screenshot 2026-10-08 at 10.42.13.png', size: 812345, preview: SWATCH }, { kind: 'text', name: 'launch-checklist.md', size: 2210, text: '- [ ] Draft' }];
  model.changed();
};
document.getElementById('approval').onclick = () => {
  model.newChat(); model.start(); model.state = 'waiting-for-approval';
  model.messages = [{ role: 'user', text: 'Save that principle to a new note.' }, { role: 'agent', text: 'I can create a short note. Please review the exact action below.' }];
  // The shape Kiro V3 sends for a file write, with this fixture's vault.
  const file = `${model.cwd}/TaskNotes/Views/kanban-native.base`;
  const options = [{ optionId: 'accept', name: 'Allow', kind: 'allow_once' }, { optionId: 'always-accept', name: 'Always allow', kind: 'allow_always' }, { optionId: 'reject', name: 'Deny', kind: 'reject_once' }, { optionId: 'always-reject', name: 'Always deny', kind: 'reject_always' }];
  const meta = { kiro: { toolId: 'fs_write', consent: { capability: 'fs_write', resource: 'TaskNotes/Views/kanban-native.base', askType: 'implicit', workspaceRoot: model.cwd }, consentRound: 1 } };
  const toolCall = { sessionUpdate: 'tool_call_update', toolCallId: 'toolu_preview', title: 'Write File', kind: 'edit', status: 'pending', rawInput: { path: file, text: 'filters:\n  and:\n    - file.hasTag("task")\nviews:\n  - type: kanban\n    name: Kanban Board\n    groupBy: status\n    order:\n      - priority\n      - due\n      - projects\n' }, locations: [{ path: file }] };
  model.session.identity = { name: 'kiro', title: 'Kiro' };
  model.session.permissions.set(10, { id: 10, request: { sessionId: 'preview', toolCall: { toolCallId: 'toolu_preview', status: 'pending', title: 'Write File' }, options, _meta: meta }, params: { sessionId: 'preview', toolCall, options, _meta: meta }, options, unrecognized: [], rule: { capability: 'fs_write', resource: 'TaskNotes/Views/kanban-native.base', workspaceRoot: model.cwd } });
  model.changed();
};
