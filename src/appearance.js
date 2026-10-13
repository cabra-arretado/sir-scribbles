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
const FONT_NAMES_MAX = 200;
// Generic families and system font keywords stop working when quoted.
const KEYWORDS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', '-apple-system', 'blinkmacsystemfont']);

// Only a positive number (or numeric string) is a size; anything else follows the theme.
export function clampFontSize(value) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!(number > 0)) return null;
  return Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(number)));
}

// A custom font is a list of family names separated by commas. Any name a
// font may have is kept, joiners in Persian or Indic names included; only
// control characters, bidirectional controls, the byte order mark and the
// user's own surrounding quotes go. A name that would pass the length limit
// is dropped whole, never cut, and shorter fallbacks after it still fit.
export function cleanFontName(value) {
  if (typeof value !== 'string') return '';
  const names = [];
  let length = 0;
  for (const part of value.normalize('NFC').replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069\uFEFF]/gu, ' ').split(',')) {
    const name = part.trim().replace(/^(["'])(.*)\1$/u, '$2').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const next = length + (names.length ? 2 : 0) + name.length;
    if (next > FONT_NAMES_MAX) continue;
    length = next;
    names.push(name);
  }
  return names.join(', ');
}

// Each name becomes a quoted CSS string, so no name can end the string or
// reach another property; keywords stay bare.
function cssFamily(name) {
  return KEYWORDS.has(name.toLowerCase()) ? name : `"${name.replace(/[\\"]/g, '\\$&')}"`;
}

export function normalizeAppearance(value) {
  const font = Object.hasOwn(FONTS, value?.font) ? value.font : DEFAULT_APPEARANCE.font;
  return { font, customFont: cleanFontName(value?.customFont), fontSize: clampFontSize(value?.fontSize) };
}

export function fontFamily({ font, customFont }) {
  if (font === 'custom') {
    const names = cleanFontName(customFont);
    if (!names) return null;
    return `${names.split(', ').map(cssFamily).join(', ')}, var(--font-interface)`;
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
// Themes may set it in rem, em or calc(), so a probe measures the resolved
// pixels instead of reading the variable's text.
export function themeFontSize(doc) {
  let probe;
  try {
    probe = doc.createElement('span');
    probe.style.setProperty('font-size', `var(--font-ui-small, ${FONT_SIZE.theme}px)`);
    probe.style.setProperty('position', 'absolute');
    probe.style.setProperty('visibility', 'hidden');
    doc.body.append(probe);
    const size = parseFloat(doc.defaultView.getComputedStyle(probe).fontSize);
    return clampFontSize(size) ?? FONT_SIZE.theme;
  } catch { return FONT_SIZE.theme; }
  finally { probe?.remove(); }
}
