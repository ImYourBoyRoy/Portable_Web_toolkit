// ./scripts/lib/html-to-markdown.mjs
/**
 * Dependency-free HTML to Markdown converter for the site's own built pages (well-formed, minified Astro output).
 * Exports: htmlToMarkdown(html, { baseUrl }) -> { markdown, title, description }.
 * Scope: converts the <main> element (falls back to <body>). Drops navigation chrome, scripts, styles, SVG,
 * form controls, hidden content and eyebrow badges. Keeps headings, paragraphs, lists, links, emphasis, code,
 * tables, definition lists, details/summary, images with alt text, and form labels with select options.
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP = new Set(['script', 'style', 'svg', 'noscript', 'template', 'button', 'canvas', 'iframe', 'video', 'audio', 'picture-source', 'textarea', 'input', 'dialog', 'head']);
const BLOCK = new Set(['address', 'article', 'aside', 'div', 'figure', 'figcaption', 'footer', 'header', 'main', 'section', 'fieldset', 'form', 'dl', 'details', 'summary', 'search']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '-', ndash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', copy: '(c)', middot: '·', times: 'x', rarr: '->', larr: '<-' };
const decode = (text) => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
  .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const tokenizer = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>|([^<]+|<)/g;
  let match;
  while ((match = tokenizer.exec(html))) {
    const [, closing, opening, rawAttrs = '', selfClose, text] = match;
    const top = stack[stack.length - 1];
    if (text !== undefined) { top.children.push({ text: decode(text) }); continue; }
    if (closing) {
      const name = closing.toLowerCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === name) { stack.length = i; break; }
      }
      continue;
    }
    if (!opening) continue;
    const tag = opening.toLowerCase();
    const attrs = {};
    for (const attr of rawAttrs.matchAll(/([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    const node = { tag, attrs, children: [] };
    top.children.push(node);
    if (tag === 'script' || tag === 'style') {
      const end = html.toLowerCase().indexOf(`</${tag}`, tokenizer.lastIndex);
      if (end !== -1) tokenizer.lastIndex = html.indexOf('>', end) + 1;
      continue;
    }
    if (!VOID.has(tag) && !selfClose) stack.push(node);
  }
  return root;
}

const find = (node, predicate) => {
  if (node.tag && predicate(node)) return node;
  for (const child of node.children || []) {
    const hit = find(child, predicate);
    if (hit) return hit;
  }
  return null;
};

const textOf = (node) => node.text !== undefined
  ? node.text
  : SKIP.has(node.tag) ? '' : node.children.map(textOf).join('');

const classes = (node) => (node.attrs?.class || '').split(/\s+/).filter(Boolean);
const isHidden = (node) => node.attrs && (
  'hidden' in node.attrs || node.attrs['aria-hidden'] === 'true' || node.attrs.inert !== undefined
);

const squash = (text) => text.replace(/\s+/g, ' ');

export function htmlToMarkdown(html, { baseUrl = 'https://imyourboyroy.com' } = {}) {
  const tree = parse(html);
  const titleNode = find(tree, (node) => node.tag === 'title');
  const descriptionNode = find(tree, (node) => node.tag === 'meta' && node.attrs.name === 'description');
  const main = find(tree, (node) => node.tag === 'main') || find(tree, (node) => node.tag === 'body') || tree;

  const absolute = (href) => {
    try { return new URL(href, baseUrl).href; } catch { return null; }
  };

  const inline = (node, state = {}) => {
    if (node.text !== undefined) return squash(node.text);
    if (SKIP.has(node.tag) || isHidden(node)) return '';
    // Sibling elements such as <span>Name</span><span>v1.0</span> are separate lines in the browser, so keep a space.
    const TIGHT = new Set(['strong', 'b', 'em', 'i', 'code', 'a', 'sup', 'sub', 'br']);
    const inner = () => node.children.reduce((out, child) => {
      const piece = inline(child, state);
      if (!piece) return out;
      const needsSpace = out && !/\s$/.test(out) && !/^\s/.test(piece) && !/^[+%,.;:!?)]/.test(piece) && (child.tag ? !TIGHT.has(child.tag) : /[+%]$/.test(out));
      return out + (needsSpace ? ' ' : '') + piece;
    }, '');
    switch (node.tag) {
      case 'br': return '  \n';
      case 'strong': case 'b': { const value = inner().trim(); return value ? `**${value}**` : ''; }
      case 'em': case 'i': { const value = inner().trim(); return value ? `*${value}*` : ''; }
      case 'code': { const value = textOf(node).trim(); return value ? `\`${value}\`` : ''; }
      case 'img': {
        const alt = (node.attrs.alt || '').trim();
        const src = node.attrs.src || '';
        if (!alt || src.startsWith('data:')) return '';
        const url = absolute(src);
        return url ? `![${alt}](${url})` : alt;
      }
      case 'a': {
        const label = inner().trim() || (node.attrs['aria-label'] || '').trim();
        const href = node.attrs.href || '';
        if (!label) return '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return label;
        const url = absolute(href);
        return url ? `[${label}](${url})` : label;
      }
      case 'select': return '';
      default: return inner();
    }
  };

  const blocks = [];
  // Blocks keep leading indentation (select options) and may be `tight` (form fields join with single newlines).
  const push = (value, tight = false) => {
    const cleaned = value.replace(/[ \t]+\n/g, '\n').replace(/^\n+/, '').trimEnd();
    if (cleaned.trim()) blocks.push({ text: cleaned, tight });
  };

  const renderList = (node, depth = 0) => {
    const ordered = node.tag === 'ol';
    let index = 0;
    const lines = [];
    for (const item of node.children.filter((child) => child.tag === 'li' && !isHidden(child))) {
      index += 1;
      const marker = ordered ? `${index}.` : '-';
      const nested = [];
      const pieces = [];
      for (const child of item.children) {
        if (child.tag === 'ul' || child.tag === 'ol') { nested.push(renderList(child, depth + 1)); continue; }
        if (BLOCK.has(child.tag) || child.tag === 'p') {
          const text = child.children.map((grand) => {
            if (grand.tag === 'ul' || grand.tag === 'ol') { nested.push(renderList(grand, depth + 1)); return ''; }
            return inline(grand);
          }).join(' ');
          pieces.push({ text, tag: 'div' });
        } else pieces.push({ text: inline(child), tag: child.tag });
      }
      const head = pieces.reduce((out, piece) => {
        if (!piece.text) return out;
        const needsSpace = out && !/\s$/.test(out) && !/^\s/.test(piece.text) && !/^[+%,.;:!?)]/.test(piece.text) && (piece.tag ? piece.tag === 'div' || piece.tag === 'span' || /[+%]$/.test(out) : false);
        return out + (needsSpace ? ' ' : '') + piece.text;
      }, '').replace(/\s+/g, ' ').trim();
      lines.push(`${'  '.repeat(depth)}${marker} ${head}`.trimEnd());
      lines.push(...nested.filter(Boolean));
    }
    return lines.join('\n');
  };

  const renderTable = (node) => {
    const rows = [];
    const collect = (parent) => {
      for (const child of parent.children) {
        if (child.tag === 'tr') rows.push(child.children.filter((cell) => cell.tag === 'th' || cell.tag === 'td').map((cell) => inline(cell).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()));
        else if (child.children) collect(child);
      }
    };
    collect(node);
    if (!rows.length) return '';
    const width = Math.max(...rows.map((row) => row.length));
    const pad = (row) => [...row, ...Array(width - row.length).fill('')];
    return [`| ${pad(rows[0]).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map((row) => `| ${pad(row).join(' | ')} |`)].join('\n');
  };

  const renderSelect = (node) => node.children
    .flatMap((child) => child.tag === 'optgroup' ? child.children : [child])
    .filter((option) => option.tag === 'option' && !('disabled' in option.attrs))
    .map((option) => `  - ${squash(textOf(option)).trim()}`)
    .filter((line) => line.trim() !== '-')
    .join('\n');

  const walk = (node, state = {}) => {
    if (node.text !== undefined) { const value = squash(node.text).trim(); if (value) push(value); return; }
    if (isHidden(node)) return;
    const tag = node.tag;
    if (SKIP.has(tag) && tag !== 'button') return;
    if (tag === 'button' || tag === 'input' || tag === 'textarea') return;
    if (tag === 'nav' && !classes(node).includes('breadcrumb')) return;
    if (/^h[1-6]$/.test(tag)) { push(`${'#'.repeat(Number(tag[1]))} ${inline(node).replace(/\s+/g, ' ').trim()}`); return; }
    if (tag === 'p') { push(inline(node)); return; }
    if (tag === 'ul' || tag === 'ol') { push(renderList(node)); return; }
    if (tag === 'table') { push(renderTable(node)); return; }
    if (tag === 'hr') { push('---'); return; }
    if (tag === 'pre') { push(`\`\`\`\n${textOf(node).replace(/^\n|\n$/g, '')}\n\`\`\``); return; }
    if (tag === 'blockquote') { const before = blocks.length; node.children.forEach((child) => walk(child, state)); const quoted = blocks.splice(before).map((block) => block.text).join('\n\n'); push(quoted.split('\n').map((line) => `> ${line}`).join('\n')); return; }
    if (tag === 'dl') {
      let term = '';
      for (const child of node.children) {
        const unwrap = child.tag === 'div' ? child.children : [child];
        for (const part of unwrap) {
          if (part.tag === 'dt') term = squash(textOf(part)).trim();
          if (part.tag === 'dd') push(`**${term}**: ${inline(part).trim()}`);
        }
      }
      return;
    }
    if (tag === 'summary') { push(`**${inline(node).trim()}**`); return; }
    if (tag === 'label') { push(`- ${inline(node).replace(/\s+/g, ' ').trim()}`, true); return; }
    if (tag === 'select') { const options = renderSelect(node); if (options) push(options, true); return; }
    if (tag === 'span' && classes(node).includes('badge')) return; // eyebrow chips duplicate the heading that follows
    if (tag === 'figure' || BLOCK.has(tag) || ['body', 'main', '#root', 'li', 'aside'].includes(tag)) {
      node.children.forEach((child) => walk(child, state));
      return;
    }
    // Inline element at block level (a, span, strong...): emit as its own line.
    const line = inline(node).trim();
    if (line) push(line);
  };

  // Group consecutive label/select lines so form options stay attached to their label.
  walk(main);

  const markdown = blocks
    .map((block, index) => `${index === 0 ? '' : block.tight && blocks[index - 1].tight ? '\n' : '\n\n'}${block.text}`)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ \(opens in a new tab\)/gi, '')
    .replace(/\[([^\]\n]*?)\s+\]\(/g, '[$1](')
    .replace(/\bopens in a new tab\b\.?/gi, '')
    .replace(/[ \t]+$/gm, '');

  return {
    markdown: markdown.trim(),
    title: squash(textOf(titleNode || { children: [] })).trim(),
    description: (descriptionNode?.attrs.content || '').trim()
  };
}
