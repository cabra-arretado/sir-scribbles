// Browser-safe: a launcher button and a translucent window over the workspace.
// It only owns its own DOM. The plugin decides which chats it shows, and
// hiding the window never stops an agent.
// Idle applies while the pointer is elsewhere and nothing inside has focus.
export const OPACITY = { min: 40, max: 100, step: 5, initial: 85, active: 100 };

// The window is anchored bottom-right, so it grows up and to the left.
export const SIZE = { minWidth: 300, minHeight: 320, step: 20 };

export function clampOpacity(value, fallback = OPACITY.initial) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return fallback;
  return Math.min(OPACITY.max, Math.max(OPACITY.min, Math.round(number / OPACITY.step) * OPACITY.step));
}

export class FloatingChat {
  // launcherHost returns where the launcher lives, such as an Obsidian status
  // bar item. Without one it floats in the corner.
  constructor(document, { setIcon, onShow, onHide, onSidebar, onResize, launcherHost }) {
    this.document = document;
    this.actions = { setIcon, onShow, onHide, onSidebar, onResize, launcherHost };
    this.size = null;
    this.host = null;
    this.launcher = null;
    this.window = null;
    this.body = null;
    this.opacity = { idle: OPACITY.initial, active: OPACITY.active };
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
    this.window.append(this.resizeHandle(), header, this.body);
    // Escape hides the window unless a control inside already handled it.
    this.window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); void this.hide(); }
    });
    this.setOpacity(this.opacity);
    this.setSize(this.size);
    this.host = this.actions.launcherHost?.() ?? null;
    if (this.host) { this.host.classList.add('sir-scribbles-floating-item'); this.host.append(this.launcher); }
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

  // Percentages: idle while not in use, active on hover, focus or resizing.
  setOpacity({ idle = this.opacity.idle, active = this.opacity.active } = {}) {
    this.opacity = { idle: clampOpacity(idle), active: clampOpacity(active, OPACITY.active) };
    this.window?.style.setProperty('--sir-scribbles-floating-opacity', String(this.opacity.idle / 100));
    this.window?.style.setProperty('--sir-scribbles-floating-active-opacity', String(this.opacity.active / 100));
  }

  // Bounded by the viewport; null restores the stylesheet's default size.
  setSize(size) {
    const view = this.document.defaultView;
    const maxWidth = Math.max(SIZE.minWidth, (view?.innerWidth || Infinity) - 32);
    const maxHeight = Math.max(SIZE.minHeight, (view?.innerHeight || Infinity) - 120);
    const width = Number(size?.width), height = Number(size?.height);
    this.size = Number.isFinite(width) && Number.isFinite(height) ? {
      width: Math.round(Math.min(maxWidth, Math.max(SIZE.minWidth, width))),
      height: Math.round(Math.min(maxHeight, Math.max(SIZE.minHeight, height))),
    } : null;
    if (!this.window) return this.size;
    this.window.style.width = this.size ? `${this.size.width}px` : '';
    this.window.style.height = this.size ? `${this.size.height}px` : '';
    return this.size;
  }

  // A grip in the top-left corner: drag it, or focus it and use the arrow keys.
  resizeHandle() {
    const grip = this.el('button', 'sir-scribbles-floating-resize');
    grip.type = 'button';
    grip.setAttribute('aria-label', 'Resize floating chat');
    const current = () => {
      const box = this.window.getBoundingClientRect();
      return this.size ?? { width: box.width, height: box.height };
    };
    const finish = () => { if (this.size) this.actions.onResize?.(this.size); };
    grip.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY, ...current() };
      grip.setPointerCapture?.(event.pointerId);
      this.window.classList.add('is-resizing');
      const move = moved => this.setSize({ width: start.width + start.x - moved.clientX, height: start.height + start.y - moved.clientY });
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        this.window?.classList.remove('is-resizing');
        finish();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    const KEYS = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    grip.addEventListener('keydown', event => {
      const delta = KEYS[event.key];
      if (!delta) return;
      event.preventDefault();
      const size = current();
      this.setSize({ width: size.width + delta[0] * SIZE.step, height: size.height + delta[1] * SIZE.step });
      finish();
    });
    return grip;
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
