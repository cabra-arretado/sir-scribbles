// Chat text preferences: the font and size of messages and the prompt.
// Applied as CSS variables on each mounted chat container, so the sidebar,
// the floating window and a popout window follow them alike. Unset values
// fall back to the theme.
export const FONT_SIZE = { min: 10, max: 28, step: 1, theme: 13 };
export const FONTS = {
  interface: { label: 'Interface font', css: 'var(--font-interface)' },
  text: { label: 'Note text font', css: 'var(--font-text)' },
  monospace: { label: 'Monospace font', css: 'var(--font-monospace)' },
  custom: { label: 'Custom', css: null },
};
export const DEFAULT_APPEARANCE = { font: 'interface', customFont: '', fontSize: null };
// Generic families are CSS keywords and must stay unquoted.
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);

// Only a positive number (or numeric string) is a size; anything else follows the theme.
export function clampFontSize(value) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!(number > 0)) return null;
  return Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(number)));
}

// A custom font is a list of family names: letters, digits, spaces, dots,
// hyphens and underscores, separated by commas. Quotes are added here, so
// nothing typed can produce invalid CSS or reach another property.
export function cleanFontName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\p{L}\p{N} ,._-]/gu, '').split(',').map(name => name.trim().replace(/\s+/g, ' ')).filter(Boolean).join(', ').slice(0, 200);
}

export function normalizeAppearance(value) {
  const font = Object.hasOwn(FONTS, value?.font) ? value.font : DEFAULT_APPEARANCE.font;
  return { font, customFont: cleanFontName(value?.customFont), fontSize: clampFontSize(value?.fontSize) };
}

export function fontFamily({ font, customFont }) {
  if (font === 'custom') {
    const names = cleanFontName(customFont);
    if (!names) return null;
    return `${names.split(', ').map(name => GENERIC.has(name.toLowerCase()) ? name : `"${name}"`).join(', ')}, var(--font-interface)`;
  }
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

// The theme's chat size, for placing the slider while it follows the theme.
export function themeFontSize(target) {
  try {
    const size = parseFloat(target.ownerDocument.defaultView.getComputedStyle(target).getPropertyValue('--font-ui-small'));
    return clampFontSize(size) ?? FONT_SIZE.theme;
  } catch { return FONT_SIZE.theme; }
}
