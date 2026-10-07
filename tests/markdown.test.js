import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import { renderMarkdown, settleStreaming } from '../src/markdown.js';

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

test('streaming display hides unfinished syntax without changing finished text', () => {
  const cases = [
    ['Hello **bo', 'Hello **bo**'],
    ['Hello **bold** and *it', 'Hello **bold** and *it*'],
    ['5 * 3 = 1', '5 * 3 = 1'],
    ['a `co', 'a `co`'],
    ['Text ~~gone', 'Text ~~gone~~'],
    ['Para\n-', 'Para'],
    ['Para\n\n1.', 'Para'],
    ['x\n```j', 'x'],
    ['x\n```js\nconst **a', 'x\n```js\nconst **a'],
    ['See [docs](https://ex', 'See docs'],
    ['See [[Projects/Launch no', 'See '],
    ['See [[Projects/Launch notes|Launch no', 'See Launch no'],
    ['![[Emb', '![[Emb'],
    ['Done **bold** [[Note]] and [x](https://a.test).', 'Done **bold** [[Note]] and [x](https://a.test).'],
  ];
  for (const [source, shown] of cases) assert.equal(settleStreaming(source), shown, source);
});

test('streaming tidy-up stays linear on adversarial replies', () => {
  for (const source of ['[['.repeat(320000), '*'.repeat(640000) + 'x', '](' .repeat(320000), '`'.repeat(640000) + 'x', ' \n'.repeat(320000) + '*x']) {
    const start = performance.now();
    settleStreaming(source);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1000, `Settling took ${elapsed.toFixed(0)} ms`);
  }
});

test('re-rendering keeps unchanged leading blocks in place', () => {
  const dom = new JSDOM('<main></main>');
  const root = dom.window.document.querySelector('main');
  renderMarkdown(root, '# Title\n\nFirst paragraph.\n\nSecond');
  const [heading, first] = root.children;
  renderMarkdown(root, '# Title\n\nFirst paragraph.\n\nSecond, longer');
  assert.equal(root.children[0], heading);
  assert.equal(root.children[1], first);
  assert.equal(root.children[2].textContent, 'Second, longer');
  renderMarkdown(root, 'Replaced');
  assert.equal(root.textContent, 'Replaced');
  dom.window.close();
});

test('a reused link opens the destination its definition finished with', () => {
  const dom = new JSDOM('<main></main>');
  const root = dom.window.document.querySelector('main');
  const opened = [];
  const openNote = target => { opened.push(target); };
  renderMarkdown(root, 'See [Plan][ref].\n\n[ref]: Pro', { openNote });
  renderMarkdown(root, 'See [Plan][ref].\n\n[ref]: Projects/Plan.md', { openNote });
  root.querySelector('a').click();
  assert.deepEqual(opened, ['Projects/Plan.md']);
  dom.window.close();
});

test('replies with many blocks render without overflowing the stack', () => {
  const dom = new JSDOM('<main></main>');
  const root = dom.window.document.querySelector('main');
  renderMarkdown(root, 'x\n\n'.repeat(130000));
  assert.equal(root.childElementCount, 130000);
  dom.window.close();
});
