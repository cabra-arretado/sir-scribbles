import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false, linkify: true, maxNesting: 32 });
// Only addresses with an explicit scheme become links: `example.com` stays text.
markdown.linkify.set({ fuzzyLink: false, fuzzyEmail: false });
// markdown-it drops `file:` links; keep them as tokens so one into the vault
// can open as a note. The renderer below never sets a `file:` href.
const validateLink = markdown.validateLink;
markdown.validateLink = url => /^file:/i.test(url) || validateLink(url);
const delimiterIndexes = new WeakMap();
function nextPosition(positions, from) {
  let low = 0, high = positions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (positions[middle] < from) low = middle + 1;
    else high = middle;
  }
  return positions[low] ?? Infinity;
}
function delimiters(state) {
  let index = delimiterIndexes.get(state);
  if (!index) {
    index = { closes: [], newlines: [] };
    // Index once per inline parse, including silent/backtracking probes. Never
    // repeatedly scan or slice the remainder for malformed opening brackets.
    for (let i = 0; i < state.src.length; i++) {
      if (state.src[i] === ']' && state.src[i + 1] === ']') index.closes.push(i);
      else if (state.src[i] === '\n') index.newlines.push(i);
    }
    delimiterIndexes.set(state, index);
  }
  return index;
}
markdown.inline.ruler.before('link', 'vault_link', (state, silent) => {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== '[[' || state.src[start - 1] === '!') return false;
  const index = delimiters(state);
  const end = nextPosition(index.closes, start + 2);
  if (end >= state.posMax || nextPosition(index.newlines, start + 2) < end) return false;
  const content = state.src.slice(start + 2, end);
  if (!content) return false;
  const divider = content.indexOf('|');
  const target = divider < 0 ? content : content.slice(0, divider);
  const label = divider < 0 ? content : content.slice(divider + 1);
  if (!silent) {
    const token = state.push('vault_link', '', 0);
    token.content = label;
    token.meta = { target };
  }
  state.pos = end + 2;
  return true;
});
// Images stay as visible Markdown text: rendering a reply never loads a remote
// resource or resolves a vault embed. No plugins or raw-HTML renderer are used.
const tags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'strong', 'em', 's', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);

// Agents run with the vault as their working directory and often cite notes
// by absolute path or file URL. Those inside the vault open as vault paths.
export function noteLinkTarget(href, encoded = false, vaultPath = '') {
  try {
    let decoded;
    // Parse a file URL before decoding it, so the path and its #heading or
    // #^block fragment are each decoded exactly once.
    if (vaultPath && /^file:\/\//i.test(href)) {
      const url = new URL(href);
      decoded = decodeURIComponent(url.pathname) + decodeURIComponent(url.hash);
    } else decoded = encoded ? decodeURIComponent(href) : href;
    if (vaultPath) {
      const root = vaultPath.replace(/\/+$/, '') + '/';
      if (decoded.startsWith(root)) decoded = decoded.slice(root.length);
    }
    if (!decoded || /[\p{Cc}\\]/u.test(decoded) || decoded.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(decoded)) return null;
    return decoded;
  } catch { return null; }
}

// True when the last occurrence of a marker opens a span, i.e. it is followed
// by text. An odd count alone would also close lone operators like `5 * 3`.
function unclosed(text, marker) {
  const parts = text.split(marker);
  return parts.length % 2 === 0 && /^\S/.test(parts.at(-1));
}

// Display-only tidy-up for a reply that is still streaming. Unfinished syntax
// would otherwise flash as raw characters (`**bo`), or briefly restyle the
// paragraph above (a lone `-` underline makes it a heading). The final render
// always uses the exact source. Scans are linear: the reply is agent-supplied.
export function settleStreaming(source) {
  let text = source;
  let lastBreak = text.lastIndexOf('\n');
  // A line that is only a list, heading, quote or rule marker so far, or a
  // fence line whose language is still arriving.
  let line = text.slice(lastBreak + 1);
  if (line.length < 16 && /^\s*(?:[-=*_#>+]+|\d+[.)])?\s*$/.test(line) || /^ {0,3}(?:```|~~~)/.test(line)) {
    text = text.slice(0, lastBreak + 1);
  }
  // An open fenced block already renders as code until it closes.
  if ((text.match(/^ {0,3}(?:```|~~~)/gm) ?? []).length % 2) return text;
  let end = text.length;
  while (end && '*_~` \t\n'.includes(text[end - 1])) end--;
  text = text.slice(0, end);
  lastBreak = text.lastIndexOf('\n');
  line = text.slice(lastBreak + 1);
  // A link still arriving shows its label only: `[label](htt`, and the
  // `[[path|label` of a note link, whose bare path may later gain a label.
  const wiki = line.lastIndexOf('[[');
  const target = line.lastIndexOf('](');
  if (wiki >= 0 && !line.includes(']]', wiki) && line[wiki - 1] !== '!') {
    const inner = line.slice(wiki + 2);
    line = line.slice(0, wiki) + (inner.includes('|') ? inner.slice(inner.lastIndexOf('|') + 1) : '');
  } else if (target >= 0 && !/[)\s]/.test(line.slice(target + 2))) {
    const open = line.lastIndexOf('[', target);
    if (open >= 0 && !line.slice(open + 1, target).includes(']')) line = line.slice(0, open) + line.slice(open + 1, target);
  }
  text = text.slice(0, lastBreak + 1) + line;
  const block = text.slice(text.lastIndexOf('\n\n') + 1);
  let suffix = '';
  if ((block.match(/`/g) ?? []).length % 2) suffix += '`';
  const prose = block.replace(/`[^`]*`?/g, '');
  if (unclosed(prose.replace(/\*\*/g, '').replace(/^[ \t]*\* /gm, ''), '*')) suffix += '*';
  if (unclosed(prose, '**')) suffix += '**';
  if (unclosed(prose, '~~')) suffix += '~~';
  return text + suffix;
}

// One page of a reply. Agent output has no size limit short of the session's,
// and every rendered node costs memory: a 390 KB reply of short paragraphs
// otherwise builds 130,000 elements. Callers raise the page count on request.
export const RENDER_BUDGET = { chars: 100_000, tokens: 25_000 };

// Cut where a block ends when one is near, so the last shown paragraph is whole.
function budgetSource(source, max) {
  if (source.length <= max) return source;
  let cut = source.lastIndexOf('\n\n', max);
  if (cut < max / 2) cut = source.lastIndexOf('\n', max);
  if (cut < max / 2) cut = max - (/[\ud800-\udbff]/.test(source[max - 1]) ? 1 : 0);
  return source.slice(0, cut);
}

// Returns true when the budget left part of the source unrendered.
export function renderMarkdown(container, source, { openNote, sourcePath = '', vaultPath = '', pages = 1 } = {}) {
  const document = container.ownerDocument;
  const fragment = document.createDocumentFragment();
  const stack = [fragment];
  const shown = budgetSource(source, RENDER_BUDGET.chars * pages);
  let tokensLeft = RENDER_BUDGET.tokens * pages;
  let truncated = shown.length < source.length;
  const wireNote = (element, target) => {
    if (!openNote) return;
    element.classList.add('internal-link');
    element.setAttribute('href', '#');
    // Streaming reuses unchanged nodes, and `isEqualNode` ignores listeners:
    // record the destination so a link whose target changed is replaced.
    element.dataset.note = JSON.stringify(target);
    // Link text is agent-controlled; the tooltip names the note it opens.
    element.title = typeof target === 'object' ? target.path : target;
    element.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void openNote(target, sourcePath, event.metaKey || event.ctrlKey);
    });
  };
  const append = tokens => {
    for (const token of tokens) {
      if (tokensLeft-- <= 0) { truncated = true; return; }
      const parent = stack.at(-1);
      if (token.type === 'inline') { append(token.children ?? []); if (tokensLeft < 0) return; continue; }
      if (token.type === 'vault_link') {
        const link = document.createElement('a');
        link.textContent = token.content;
        const target = noteLinkTarget(token.meta.target, false, vaultPath);
        if (target) wireNote(link, target);
        parent.append(link);
      } else if (token.type === 'text' || token.type === 'softbreak') {
        parent.append(document.createTextNode(token.type === 'softbreak' ? '\n' : token.content));
      } else if (token.type === 'image') {
        parent.append(document.createTextNode(`![${token.content}](${token.attrGet('src') ?? ''})`));
      } else if (token.type === 'code_inline' || token.type === 'fence' || token.type === 'code_block') {
        const code = document.createElement('code');
        code.textContent = token.content;
        if (token.type === 'code_inline') parent.append(code);
        else {
          const pre = document.createElement('pre');
          pre.append(code);
          parent.append(pre);
        }
      } else if (token.type === 'hardbreak' || token.type === 'hr') {
        parent.append(document.createElement(token.type === 'hr' ? 'hr' : 'br'));
      } else if (tags.has(token.tag)) {
        if (token.nesting === -1) {
          const closed = stack.pop();
          // Link text is agent-controlled; show where the click actually goes.
          const host = closed.dataset?.externalHost;
          if (host && ![host, closed.getAttribute('href')].includes(closed.textContent.trim())) {
            const label = document.createElement('span');
            label.className = 'sir-scribbles-link-host';
            label.textContent = ` (${host})`;
            closed.after(label);
          }
          continue;
        }
        const element = document.createElement(token.tag);
        if (token.tag === 'a') {
          const href = token.attrGet('href') ?? '';
          // Note navigation is a click-only callback to the current vault,
          // never a file URL or arbitrary application protocol dispatch.
          if (/^(https?:\/\/|mailto:)/i.test(href)) {
            element.setAttribute('href', href);
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
            try { if (/^https?:/i.test(href)) element.dataset.externalHost = new URL(href).host; }
            catch { /* Malformed URLs keep only the full-address tooltip. */ }
          } else if (href.startsWith('obsidian://open?')) {
            try {
              const url = new URL(href);
              const target = noteLinkTarget(url.searchParams.get('file') ?? '');
              if (target && openNote) wireNote(element, { path: target, vault: url.searchParams.get('vault') });
            } catch { /* Malformed application links stay inert. */ }
          } else {
            const target = noteLinkTarget(href, true, vaultPath);
            if (target) wireNote(element, target);
          }
          const title = token.attrGet('title');
          const external = element.hasAttribute('href') && element.getAttribute('href') !== '#';
          if (external) element.title = title ? `${title}\n${href}` : href;
          else if (title) element.title = element.title ? `${title}\n${element.title}` : title;
        } else if (token.tag === 'ol') {
          const start = token.attrGet('start');
          if (start && /^\d+$/.test(start)) element.setAttribute('start', start);
        }
        parent.append(element);
        if (token.nesting === 1) stack.push(element);
      }
    }
  };
  append(markdown.parse(shown, {}));
  // Keep leading blocks that did not change, so streaming only touches the
  // tail: earlier paragraphs do not reflow and a text selection survives.
  // Walk siblings rather than copying node lists, and append the fragment
  // itself: spreading a long reply into arguments overflows the stack.
  let kept = container.firstChild;
  while (kept && fragment.firstChild?.isEqualNode(kept)) {
    fragment.firstChild.remove();
    kept = kept.nextSibling;
  }
  while (kept) {
    const stale = kept;
    kept = kept.nextSibling;
    stale.remove();
  }
  container.append(fragment);
  return truncated;
}
