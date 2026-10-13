import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFontName, fontFamily, clampFontSize } from '../src/appearance.js';

const custom = customFont => fontFamily({ font: 'custom', customFont });

test('custom font names keep every character a real font name may have', () => {
  assert.equal(cleanFontName('मंगल'), 'मंगल', 'combining marks stay');
  assert.equal(cleanFontName('Café'), 'Café', 'decomposed input is composed');
  assert.equal(cleanFontName("M+ 1p, O'Reilly Sans"), "M+ 1p, O'Reilly Sans");
  assert.equal(cleanFontName(' "Fira  Code" , \'Inter\',, '), 'Fira Code, Inter', 'surrounding quotes, spaces and empty names go');
  assert.equal(cleanFontName('Inter\u0000\nBold'), 'Inter Bold', 'control characters become spaces');
  assert.equal(cleanFontName(42), '');
});

test('custom font names are dropped whole at the length limit, never cut', () => {
  const long = 'A'.repeat(197);
  assert.equal(cleanFontName(`${long}, Bcd`), long);
  assert.equal(cleanFontName(`Inter, ${'B'.repeat(250)}`), 'Inter');
  assert.equal(cleanFontName('C'.repeat(201)), '');
});

test('each custom name is one quoted CSS string; keywords stay bare', () => {
  assert.equal(custom('-apple-system, BlinkMacSystemFont, Inter, emoji'), '-apple-system, BlinkMacSystemFont, "Inter", emoji, var(--font-interface)');
  assert.equal(custom('a"b\\c; color: red'), '"a\\"b\\\\c; color: red", var(--font-interface)');
  assert.equal(custom('  '), null, 'an empty custom font follows the theme');
});

test('only positive numbers are sizes', () => {
  for (const value of [0, -4, false, true, null, undefined, '', ' ', 'abc', '12px', NaN, Infinity * 0]) assert.equal(clampFontSize(value), null, String(value));
  assert.equal(clampFontSize(3), 10);
  assert.equal(clampFontSize('16'), 16);
  assert.equal(clampFontSize(99), 28);
  assert.equal(clampFontSize(13.6), 14);
});
