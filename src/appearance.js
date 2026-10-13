// Chat text preferences: the font and size of messages and the prompt.
// Applied as CSS variables on the document, so the sidebar and the floating
// window follow them alike. Unset values fall back to the theme.
export const FONT_SIZE = { min: 10, max: 28, step: 1 };
export const FONTS = {
  interface: { label: 'Interface font', css: 'var(--font-interface)' },
  text: { label: 'Note text font', css: 'var(--font-text)' },
  monospace: { label: 'Monospace font', css: 'var(--font-monospace)' },
  custom: { label: 'Custom', css: null },
};
export const DEFAULT_APPEARANCE = { font: 'interface', customFont: '', fontSize: null };

export function clampFontSize(value) {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number)) return null;
  return Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(number)));
}

export function normalizeAppearance(value) {
  const font = Object.hasOwn(FONTS, value?.font) ? value.font : DEFAULT_APPEARANCE.font;
  // A custom family is one CSS value: no declarations or blocks.
  const customFont = typeof value?.customFont === 'string' ? value.customFont.replace(/[;{}<>]/g, '').trim().slice(0, 200) : '';
  return { font, customFont, fontSize: clampFontSize(value?.fontSize) };
}

export function fontFamily({ font, customFont }) {
  if (font === 'custom') return customFont ? `${customFont}, var(--font-interface)` : null;
  return font === DEFAULT_APPEARANCE.font ? null : FONTS[font].css;
}

export function applyAppearance(target, appearance) {
  if (!target?.style) return;
  const family = fontFamily(appearance);
  if (family) target.style.setProperty('--sir-scribbles-chat-font', family);
  else target.style.removeProperty('--sir-scribbles-chat-font');
  if (appearance.fontSize) target.style.setProperty('--sir-scribbles-chat-font-size', `${appearance.fontSize}px`);
  else target.style.removeProperty('--sir-scribbles-chat-font-size');
}
