import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false, linkify: false, maxNesting: 32 });
// Images stay as visible Markdown text: rendering a reply never loads a remote
// resource or resolves a vault embed. No plugins or raw-HTML renderer are used.
const tags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'strong', 'em', 's', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);

export function renderMarkdown(container, source) {
  const document = container.ownerDocument;
  const fragment = document.createDocumentFragment();
  const stack = [fragment];
  const append = tokens => {
    for (const token of tokens) {
      const parent = stack.at(-1);
      if (token.type === 'inline') { append(token.children ?? []); continue; }
      if (token.type === 'text' || token.type === 'softbreak') {
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
          // Only explicit web/mail links are navigable. No file, obsidian,
          // script or data URLs can activate application actions.
          if (/^(https?:\/\/|mailto:)/i.test(href)) {
            element.setAttribute('href', href);
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
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
