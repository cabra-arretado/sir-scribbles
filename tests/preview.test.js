import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

// The preview's fixture must keep up with the controller interface the panel
// calls, or the preview page fails on its first render.
test('the UI preview initializes and shows its fixtures', async t => {
  const html = await readFile(new URL('../preview/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://preview.test' });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await import('../preview/preview.js');
  const panel = dom.window.document.getElementById('panel');
  assert.ok(panel.querySelector('.sir-scribbles-model'));
  dom.window.document.getElementById('conversation').click();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(panel.querySelector('.sir-scribbles-effort').hidden, true);
  assert.ok([...panel.querySelectorAll('summary')].some(summary => summary.textContent.includes('“product principles examples”')));
});
