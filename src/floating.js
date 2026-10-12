// Browser-safe: a launcher button and a translucent window over the workspace.
// It only owns its own DOM. The plugin decides which chats it shows, and
// hiding the window never stops an agent.
export const OPACITY = { min: 40, max: 100, step: 5, initial: 85 };

export function clampOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return OPACITY.initial;
  return Math.min(OPACITY.max, Math.max(OPACITY.min, Math.round(number / OPACITY.step) * OPACITY.step));
}

export class FloatingChat {
  // launcherHost returns where the launcher lives, such as an Obsidian status
  // bar item. Without one it floats in the corner.
  constructor(document, { setIcon, onShow, onHide, onSidebar, launcherHost }) {
    this.document = document;
    this.actions = { setIcon, onShow, onHide, onSidebar, launcherHost };
    this.host = null;
    this.launcher = null;
    this.window = null;
    this.body = null;
    this.opacity = OPACITY.initial;
  }
  get enabled() { return Boolean(this.launcher); }
  get open() { return Boolean(this.window && !this.window.hidden); }

  el(tag, className = '') {
    const node = this.document.createElement(tag);
    if (className) node.className = className;
    return node;
  }
  // The label doubles as the accessible name and Obsidian's tooltip.
  button(icon, label, action, className) {
    const button = this.el('button', `clickable-icon ${className}`);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    if (this.actions.setIcon) this.actions.setIcon(button, icon);
    else button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  enable() {
    if (this.enabled) return;
    this.launcher = this.button('messages-square', 'Show floating chat', () => { void this.toggle(); }, 'sir-scribbles-floating-launcher');
    this.launcher.setAttribute('aria-expanded', 'false');
    this.window = this.el('section', 'sir-scribbles-floating');
    this.window.hidden = true;
    this.window.setAttribute('role', 'dialog');
    this.window.setAttribute('aria-label', 'Sir Scribbles');
    const header = this.el('header', 'sir-scribbles-floating-header');
    const title = this.el('span', 'sir-scribbles-floating-title');
    title.textContent = 'Sir Scribbles';
    header.append(title,
      this.button('panel-right', 'Move to sidebar', () => { void this.actions.onSidebar?.(); }, 'sir-scribbles-floating-sidebar'),
      this.button('minus', 'Hide floating chat', () => { void this.hide(); }, 'sir-scribbles-floating-hide'));
    this.body = this.el('div', 'sir-scribbles-floating-body');
    this.window.append(header, this.body);
    // Escape hides the window unless a control inside already handled it.
    this.window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); void this.hide(); }
    });
    this.setOpacity(this.opacity);
    this.host = this.actions.launcherHost?.() ?? null;
    if (this.host) this.host.append(this.launcher);
    else { this.launcher.classList.add('is-floating'); this.window.classList.add('above-launcher'); }
    this.document.body.append(this.window, ...(this.host ? [] : [this.launcher]));
  }

  async disable() {
    if (!this.enabled) return;
    await this.hide({ focus: false });
    this.window.remove();
    this.launcher.remove();
    this.host?.remove();
    this.host = this.launcher = this.window = this.body = null;
  }

  async show() {
    if (!this.enabled || this.open) return;
    this.window.hidden = false;
    this.launcher.setAttribute('aria-expanded', 'true');
    this.launcher.setAttribute('aria-label', 'Hide floating chat');
    await this.actions.onShow?.(this.body);
    if (this.open) this.window.querySelector('textarea')?.focus();
  }

  async hide({ focus = true } = {}) {
    if (!this.open) return;
    this.window.hidden = true;
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.setAttribute('aria-label', 'Show floating chat');
    await this.actions.onHide?.(this.body);
    this.body.replaceChildren();
    if (focus) this.launcher.focus();
  }

  toggle() { return this.open ? this.hide() : this.show(); }

  setOpacity(value) {
    this.opacity = clampOpacity(value);
    this.window?.style.setProperty('--sir-scribbles-floating-opacity', String(this.opacity / 100));
  }

  // A hidden window still has running chats; the launcher shows when one is
  // busy or, more urgently, waiting for an approval.
  setActivity(states) {
    if (!this.launcher) return;
    const activity = states.includes('waiting-for-approval') ? 'approval'
      : states.some(state => ['starting', 'working', 'stopping'].includes(state)) ? 'working' : '';
    if (activity) this.launcher.dataset.activity = activity;
    else delete this.launcher.dataset.activity;
  }
}
