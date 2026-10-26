// ./Web_Toolkit/discovery_doctor/src/xml.mjs
/**
 * Small, dependency-free XML parser used for bounded discovery documents.
 *
 * This is deliberately not a general XML implementation. It rejects DTDs and
 * external entities, preserves element names/attributes/text, and is enough
 * for validating sitemap documents without trusting a regex-only match.
 */

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

function parseAttributes(raw = '') {
  let rest = String(raw || '').trim();
  const attributes = {};

  while (rest) {
    const match = rest.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2\s*/);
    if (!match) return { ok: false, error: `Malformed XML attribute list near: ${rest.slice(0, 80)}` };
    const [, name, , value] = match;
    if (Object.prototype.hasOwnProperty.call(attributes, name)) {
      return { ok: false, error: `Duplicate XML attribute: ${name}` };
    }
    attributes[name] = value;
    rest = rest.slice(match[0].length);
  }

  return { ok: true, attributes };
}

function appendText(node, value) {
  if (!node || !value) return;
  node.text += value;
}

/**
 * Parse a bounded XML document into a small element tree.
 * @returns {{ok: boolean, root: object|null, errors: string[]}}
 */
export function parseXmlDocument(input = '', options = {}) {
  const source = stripBom(input);
  const maxBytes = Number(options.maxBytes || 8 * 1024 * 1024);
  const errors = [];

  if (Buffer.byteLength(source, 'utf8') > maxBytes) {
    return { ok: false, root: null, errors: [`XML document exceeds ${maxBytes} bytes.`] };
  }
  if (!source.trim()) return { ok: false, root: null, errors: ['XML document is empty.'] };
  if (/<!DOCTYPE\b/i.test(source) || /<!ENTITY\b/i.test(source)) {
    return { ok: false, root: null, errors: ['DTD and external entity declarations are not allowed.'] };
  }

  const tokenPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][A-Za-z0-9_.:-]*(?:\s+[^<>]*?)?\/?\s*>/g;
  const stack = [];
  let root = null;
  let cursor = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    const between = source.slice(cursor, index);
    if (between.includes('<')) errors.push(`Malformed XML near byte ${cursor}.`);
    if (stack.length > 0) appendText(stack[stack.length - 1], between);
    else if (between.trim()) errors.push('Non-whitespace text appears outside the XML root element.');

    cursor = index + token.length;

    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<![CDATA[')) {
      if (stack.length === 0) errors.push('CDATA appears outside the XML root element.');
      else appendText(stack[stack.length - 1], token.slice(9, -3));
      continue;
    }

    if (token.startsWith('</')) {
      const closeMatch = token.match(/^<\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*>$/);
      if (!closeMatch) {
        errors.push(`Malformed closing tag: ${token}`);
        continue;
      }
      const current = stack.pop();
      if (!current || current.name !== closeMatch[1]) {
        errors.push(`Mismatched closing tag: ${closeMatch[1]}.`);
      }
      continue;
    }

    const openMatch = token.match(/^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*?)>$/);
    if (!openMatch) {
      errors.push(`Malformed opening tag: ${token}`);
      continue;
    }

    const name = openMatch[1];
    if (!NAME_RE.test(name)) errors.push(`Invalid XML element name: ${name}`);
    const rawAttributes = openMatch[2] || '';
    const selfClosing = /\/\s*$/.test(rawAttributes);
    const attributeSource = selfClosing ? rawAttributes.replace(/\/\s*$/, '') : rawAttributes;
    const parsedAttributes = parseAttributes(attributeSource);
    if (!parsedAttributes.ok) errors.push(parsedAttributes.error);

    const node = {
      name,
      attributes: parsedAttributes.attributes || {},
      text: '',
      children: [],
    };

    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else if (root) errors.push('XML document contains more than one root element.');
    else root = node;

    if (!selfClosing) stack.push(node);
  }

  const trailing = source.slice(cursor);
  if (trailing.includes('<')) errors.push(`Malformed XML near byte ${cursor}.`);
  if (stack.length > 0) errors.push(`Unclosed XML element: ${stack[stack.length - 1].name}.`);
  if (stack.length === 0 && trailing.trim()) errors.push('Non-whitespace text appears after the XML root element.');
  if (!root) errors.push('XML document has no root element.');

  return { ok: errors.length === 0, root, errors };
}

export function decodeXmlEntities(value = '') {
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (full, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    const codePoint = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return full;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return full;
    }
  });
}

export function xmlTextContent(node = null) {
  if (!node) return '';
  return `${node.text || ''}${(node.children || []).map((child) => xmlTextContent(child)).join('')}`;
}
