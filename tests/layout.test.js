import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { statusBarInset } from '../src/layout.js';

const rect = (left, top, right, bottom) => () => ({ left, top, right, bottom, width: right - left, height: bottom - top });

test('the composer reserves only the part of the view the status bar covers', () => {
  const dom = new JSDOM('<main></main>');
  const document = dom.window.document;
  const view = document.querySelector('main');
  view.getBoundingClientRect = rect(700, 40, 1000, 800);
  assert.equal(statusBarInset(view), 0, 'no status bar, as in popout windows');
  const bar = document.createElement('div');
  bar.className = 'status-bar';
  document.body.append(bar);
  bar.getBoundingClientRect = rect(560, 776.5, 1000, 800);
  assert.equal(statusBarInset(view), 24, 'overlapping the right sidebar');
  bar.getBoundingClientRect = rect(0, 0, 0, 0);
  assert.equal(statusBarInset(view), 0, 'hidden status bar');
  view.getBoundingClientRect = rect(0, 40, 300, 800);
  bar.getBoundingClientRect = rect(560, 776, 1000, 800);
  assert.equal(statusBarInset(view), 0, 'view docked on the left');
  dom.window.close();
});
