import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false, linkify: false, maxNesting: 32 });
markdown.inline.ruler.before('link', 'vault_link', (state, silent) => {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== '[[' || state.src[start - 1] === '!') return false;
  const end = state.src.indexOf(']]', start + 2);
  if (end < 0 || end >= state.posMax) return false;
  const content = state.src.slice(start + 2, end);
  if (!content || content.includes('\n')) return false;
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

export function noteLinkTarget(href, encoded = false) {
  try {
    const decoded = encoded ? decodeURIComponent(href) : href;
    if (!decoded || /[\u0000-\u001f\\]/.test(decoded) || decoded.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(decoded)) return null;
    return decoded;
  } catch { return null; }
}

export function renderMarkdown(container, source, { openNote, sourcePath = '' } = {}) {
  const document = container.ownerDocument;
  const fragment = document.createDocumentFragment();
  const stack = [fragment];
  const wireNote = (element, target) => {
    if (!openNote) return;
    element.classList.add('internal-link');
    element.setAttribute('href', '#');
    element.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void openNote(target, sourcePath, event.metaKey || event.ctrlKey);
    });
  };
  const append = tokens => {
    for (const token of tokens) {
      const parent = stack.at(-1);
      if (token.type === 'inline') { append(token.children ?? []); continue; }
      if (token.type === 'vault_link') {
        const link = document.createElement('a');
        link.textContent = token.content;
        const target = noteLinkTarget(token.meta.target);
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
        if (token.nesting === -1) { stack.pop(); continue; }
        const element = document.createElement(token.tag);
        if (token.tag === 'a') {
          const href = token.attrGet('href') ?? '';
          // Note navigation is a click-only callback to the current vault,
          // never a file URL or arbitrary application protocol dispatch.
          if (/^(https?:\/\/|mailto:)/i.test(href)) {
            element.setAttribute('href', href);
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
          } else if (href.startsWith('obsidian://open?')) {
            try {
              const url = new URL(href);
              const target = noteLinkTarget(url.searchParams.get('file') ?? '');
              if (target && openNote) wireNote(element, { path: target, vault: url.searchParams.get('vault') });
            } catch { /* Malformed application links stay inert. */ }
          } else {
            const target = noteLinkTarget(href, true);
            if (target) wireNote(element, target);
          }
          const title = token.attrGet('title');
          if (title) element.title = title;
        } else if (token.tag === 'ol') {
          const start = token.attrGet('start');
          if (start && /^\d+$/.test(start)) element.setAttribute('start', start);
        }
        parent.append(element);
        if (token.nesting === 1) stack.push(element);
      }
    }
  };
  append(markdown.parse(source, {}));
  container.replaceChildren(fragment);
}
