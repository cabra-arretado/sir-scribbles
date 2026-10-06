import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../src/markdown.js';

test('large unmatched wiki prefixes do not repeatedly scan the remaining reply', () => {
  const dom = new JSDOM('<main></main>');
  const root = dom.window.document.querySelector('main');
  const source = '[['.repeat(320000);
  const start = performance.now();
  renderMarkdown(root, source);
  const elapsed = performance.now() - start;
  assert.equal(root.textContent, source);
  // The independently reproduced regression took over ten seconds locally.
  // A generous ceiling tolerates CI overhead while catching that UI freeze.
  assert.ok(elapsed < 5000, `Unmatched wiki rendering took ${elapsed.toFixed(0)} ms`);
  renderMarkdown(root, '[['.repeat(50000) + '\nblocked]]\n\n[[Valid|Label]]', { openNote: () => {} });
  assert.equal(root.querySelectorAll('.internal-link').length, 1);
  assert.equal(root.querySelector('.internal-link').textContent, 'Label');
  dom.window.close();
});
