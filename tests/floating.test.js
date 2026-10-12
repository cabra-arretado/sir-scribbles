import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { FloatingChat, OPACITY, clampOpacity } from '../src/floating.js';

function create(t, actions = {}) {
  const dom = new JSDOM('<body></body>');
  const calls = [];
  const floating = new FloatingChat(dom.window.document, {
    onShow: body => { calls.push('show'); body.textContent = 'chats'; },
    onHide: () => { calls.push('hide'); },
    ...actions,
  });
  t.after(() => dom.window.close());
  return { dom, floating, calls, document: dom.window.document };
}

test('the floating chat adds nothing until enabled and removes everything when disabled', async t => {
  const { floating, document, calls } = create(t);
  assert.equal(document.body.children.length, 0);
  floating.enable();
  floating.enable();
  assert.equal(document.querySelectorAll('.sir-scribbles-floating-launcher').length, 1);
  assert.equal(floating.open, false);
  await floating.show();
  await floating.disable();
  assert.equal(document.body.children.length, 0);
  assert.deepEqual(calls, ['show', 'hide']);
  assert.equal(floating.enabled, false);
});

test('the launcher toggles the window; hiding clears its view and returns focus', async t => {
  const { floating, document, calls } = create(t);
  floating.enable();
  const launcher = document.querySelector('.sir-scribbles-floating-launcher');
  launcher.click();
  await Promise.resolve();
  assert.equal(floating.open, true);
  assert.equal(launcher.getAttribute('aria-expanded'), 'true');
  assert.equal(launcher.getAttribute('aria-label'), 'Hide floating chat');
  assert.equal(floating.body.textContent, 'chats');
  assert.equal(floating.window.getAttribute('role'), 'dialog');
  await floating.toggle();
  assert.equal(floating.open, false);
  assert.equal(floating.body.textContent, '');
  assert.equal(document.activeElement, launcher);
  assert.equal(launcher.getAttribute('aria-label'), 'Show floating chat');
  assert.deepEqual(calls, ['show', 'hide']);
});

test('Escape hides the window unless a control inside already handled it', async t => {
  const { floating, dom } = create(t);
  floating.enable();
  await floating.show();
  const handled = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  floating.body.addEventListener('keydown', event => event.preventDefault(), { once: true });
  floating.body.dispatchEvent(handled);
  assert.equal(floating.open, true);
  floating.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await Promise.resolve();
  assert.equal(floating.open, false);
});

test('opacity is bounded so the window never becomes invisible', t => {
  const { floating } = create(t);
  assert.equal(clampOpacity(0), OPACITY.min);
  assert.equal(clampOpacity(250), OPACITY.max);
  assert.equal(clampOpacity('nope'), OPACITY.initial);
  assert.equal(clampOpacity(72), 70);
  floating.enable();
  floating.setOpacity(10);
  assert.equal(floating.window.style.getPropertyValue('--sir-scribbles-floating-opacity'), String(OPACITY.min / 100));
});

test('the launcher shows busy chats, and approvals above all', t => {
  const { floating } = create(t);
  floating.setActivity(['working']);
  floating.enable();
  const launcher = floating.launcher;
  floating.setActivity(['ready', 'working']);
  assert.equal(launcher.dataset.activity, 'working');
  floating.setActivity(['working', 'waiting-for-approval']);
  assert.equal(launcher.dataset.activity, 'approval');
  floating.setActivity(['ready', 'not-started']);
  assert.equal(launcher.dataset.activity, undefined);
});

test('the sidebar button hands off to the plugin', async t => {
  let moved = 0;
  const { floating } = create(t, { onSidebar: () => { moved++; } });
  floating.enable();
  await floating.show();
  floating.window.querySelector('.sir-scribbles-floating-sidebar').click();
  assert.equal(moved, 1);
});

test('a launcher host keeps the button out of the workspace and is removed with it', async t => {
  const { dom, document } = create(t);
  const floating = new FloatingChat(document, { launcherHost: () => { const item = document.createElement('div'); document.body.append(item); return item; } });
  floating.enable();
  assert.equal(floating.launcher.parentElement, floating.host);
  assert.equal(floating.launcher.classList.contains('is-floating'), false);
  await floating.disable();
  assert.equal(document.body.children.length, 0);
  assert.ok(dom);
});
