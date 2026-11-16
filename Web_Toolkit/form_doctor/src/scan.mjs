// ./Web_Toolkit/form_doctor/src/scan.mjs
/**
 * Static scan: finds form pages and form handlers in a project and reports the failure modes that lose leads
 * or leak data. Read-only. Heuristic by design; each rule says what it matched and how to fix it.
 *
 * Rules (id, default severity):
 *   form-no-method (fail)        <form> without method: a no-JS submit becomes GET and puts answers in the URL
 *   form-get-method (fail)       <form method="get"> that is not a search form
 *   form-no-action (warn)        method=post without an action posts to the page itself
 *   swallowed-send-error (fail)  catch around the mail send does not return 5xx or rethrow
 *   no-error-status (fail)       handler never produces a 5xx at all, so success cannot be conditional
 *   logs-payload (fail)          console.* receives the request body, form data or a field
 *   returns-error-message (fail) err.message goes into the response
 *   no-body-cap (fail)           no Content-Length check, byte cap or 413
 *   no-allowlist (fail)          copies every submitted key (entries/fromEntries) without an allowlist or schema
 *   unescaped-html-email (fail)  HTML email built from interpolated values with no escape helper
 *   client-ignores-status (warn) fetch to the form endpoint without checking ok or status
 *   no-origin-check / no-rate-limit / no-spam-control (warn)
 *   no-handler-found (warn)      a POST form exists but no mail-sending handler is in the project
 *   malformed-surface (fail)     a surface that could not be read or parsed (fail closed)
 *   no-form (info)               the project has no form surface
 * Opt-outs on a <form>: data-form-doctor="ignore" (not a contact form), "client-only" (handled entirely in JS, no
 * server round trip) or "get-ok" (a deliberate GET form). Search forms (role="search") are never flagged.
 */

import fs from 'node:fs';
import path from 'node:path';
import { collectGraph, lineOf, matchBrace, stripComments } from './analysis.mjs';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.wrangler', '.git', 'output', 'Web_Toolkit', 'reference_files', '.agents', '.runtime', 'coverage', 'tests', 'test', '__tests__', '.next', '.vercel', 'tasklist', 'docs']);
const MARKUP_EXT = new Set(['.astro', '.html', '.svelte', '.vue', '.tsx', '.jsx']);
const CODE_EXT = new Set(['.ts', '.mts', '.js', '.mjs', '.tsx']);
const MAX_FILE_BYTES = 512 * 1024;

const POST_EXPORT = /export\s+(?:const|async\s+function|function)\s+POST\b|onRequestPost|export\s+\{[^}]*\bPOST\b[^}]*\}|(?:request|req)\.method\s*===?\s*['"]POST['"]|\.post\(\s*['"`]/;
const BODY_READ = /\.formData\(\)|\.json\(\)|\.text\(\)|req\.body|readBodyLimited|parseFormBody/;
const MAIL_SEND = /\bsend(?:Mail|Email)?\s*\(\s*\{|\bSEND_EMAIL\b|\bEMAIL\.send\b|\.send\(\s*\w*(?:message|mail|email)\w*\s*\)|resend\.com|mailchannels|api\.sendgrid|postmarkapp|web3forms|formspree|nodemailer|\/v3\/mail\/send|api\.mailgun|smtp/i;

const ESCAPE_HELPER = /escapeHtml|escapeHTML|htmlEscape|encodeHTML|sanitizeHtml|he\.encode|\besc\(|\bescape\(/;
const ALLOWLIST_MARKER = /allowlist|ALLOWED|allowed|\bschema\b|\bFIELDS\b|unexpected_field|parseIntake|parseContactInput|ALLOW_/i;
const CATCHALL = /Object\.fromEntries\(|\.entries\(\)|Object\.entries\(\s*(?:body|data|payload|fields|form|formData)\b/;
const BODY_CAP = /content-length|readBodyLimited|maxBodyBytes|MAX_BODY|MAX_BYTES|byteLength\s*>|\b413\b/i;
const ORIGIN_CHECK = /\borigin\b|sec-fetch-site|isAllowedOrigin|referer/i;
const RATE_LIMIT = /ratelimit|rate_limit|rateLimit|\.limit\(|decideRateLimit|retry-after|\b429\b/i;
const SPAM_CONTROL = /honeypot|website_confirm|company_url|_gotcha|turnstile|hcaptcha|recaptcha|form_elapsed|time.?trap|minFill/i;
const PAYLOAD_NAMES = /\b(?:allData|emailBody|payload|formData|rawBody|body|data|values|fields|submission|inquiry|form|fd)\b/;

export function finding(rule, severity, file, line, message, fix) {
  return { rule, severity, file, line, message, fix };
}

function walk(root, visitor) {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') {
        if (entry.name !== '.github') continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        visitor(full);
      }
    }
  }
}

function readText(file, malformed, root) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_FILE_BYTES) {
      malformed.push(finding('malformed-surface', 'fail', path.relative(root, file), 1, `File is larger than ${MAX_FILE_BYTES} bytes and was not analysed.`, 'Split the file or exclude it deliberately.'));
      return null;
    }
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    malformed.push(finding('malformed-surface', 'fail', path.relative(root, file), 1, `File could not be read (${error.code ?? 'error'}).`, 'Fix permissions or remove the file.'));
    return null;
  }
}

/* ------------------------------------------------------------------- forms */

function parseAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{[^}]*\})|([^\s>]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (name === 'form') continue;
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? match[5] ?? true;
  }
  return attrs;
}

export function scanMarkup(text, relFile) {
  const findings = [];
  const forms = [];
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  let stripped = text.replace(/<!--[\s\S]*?-->/g, blank);
  // Astro frontmatter carries the component's doc comment, which quotes markup such as <form method="post">; it is not markup.
  const fence = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(stripped);
  if (fence) stripped = stripped.slice(0, fence.index) + fence[0].replace(/\/\*[\s\S]*?\*\//g, blank) + stripped.slice(fence.index + fence[0].length);
  for (const match of stripped.matchAll(/<form\b/gi)) {
    const start = match.index;
    // Find the end of the opening tag, respecting quotes and {expression} attribute values.
    let i = start + 5;
    let quote = null;
    let brace = 0;
    let end = -1;
    for (; i < Math.min(stripped.length, start + 6000); i += 1) {
      const ch = stripped[i];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') brace += 1;
      else if (ch === '}') brace -= 1;
      else if (ch === '>' && brace <= 0) {
        end = i;
        break;
      }
    }
    const line = lineOf(stripped, start);
    if (end < 0) {
      findings.push(finding('malformed-surface', 'fail', relFile, line, '<form> opening tag has no closing ">" within 6000 characters.', 'Fix the markup so the form can be analysed.'));
      continue;
    }
    const attrs = parseAttributes(stripped.slice(start + 5, end));
    const method = typeof attrs.method === 'string' ? attrs.method.replace(/[{}"'`]/g, '').trim().toLowerCase() : null;
    const isSearch = attrs.role === 'search' || attrs['data-form-doctor'] === 'get-ok';
    forms.push({ file: relFile, line, method, action: typeof attrs.action === 'string' ? attrs.action : null, id: typeof attrs.id === 'string' ? attrs.id : null });
    if (attrs['data-form-doctor'] === 'ignore' || attrs['data-form-doctor'] === 'client-only') continue;
    if (isSearch) continue;
    const action = typeof attrs.action === 'string' ? attrs.action : '';
    if (/^https?:\/\//i.test(action)) continue;
    if (!method) {
      findings.push(finding('form-no-method', 'fail', relFile, line, 'The <form> has no method, so without JavaScript the browser submits GET and puts every answer in the URL (history, logs, referrers).', 'Add method="post" and an action that points at a handler which answers a plain browser POST.'));
    } else if (method === 'get') {
      findings.push(finding('form-get-method', 'fail', relFile, line, 'The <form> uses method="get" but is not a search form; answers end up in the URL.', 'Use method="post", or mark a real search form with role="search".'));
    } else if (method === 'post' && !attrs.action) {
      findings.push(finding('form-no-action', 'warn', relFile, line, 'method="post" without an action posts to the page itself, which is usually a static page that cannot answer.', 'Set action to the handler route.'));
    }
  }
  return { findings, forms, hasFetchOfFormData: /FormData\s*\(/.test(stripped) && /\bfetch\s*\(/.test(stripped), source: stripped };
}

function checkClientStatus(source, relFile) {
  if (!/FormData\s*\(/.test(source) || !/\bfetch\s*\(/.test(source)) return [];
  if (/\.ok\b|\.status\b|response\.ok|res\.ok/.test(source)) return [];
  const at = source.search(/\bfetch\s*\(/);
  return [finding('client-ignores-status', 'warn', relFile, lineOf(source, at), 'A form is posted with fetch but the response status is never checked, so any answer can look like success.', 'Check response.ok and the JSON body, and keep the visitor\'s answers on failure.')];
}

/* ---------------------------------------------------------------- handlers */

function tryBlocks(source) {
  const blocks = [];
  for (const match of source.matchAll(/\btry\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    const close = matchBrace(source, open);
    if (close < 0) {
      blocks.push({ malformedAt: match.index });
      continue;
    }
    const after = source.slice(close + 1).match(/^\s*catch\s*(?:\([^)]*\))?\s*\{/);
    if (!after) continue;
    const catchOpen = close + 1 + after[0].length - 1;
    const catchClose = matchBrace(source, catchOpen);
    if (catchClose < 0) {
      blocks.push({ malformedAt: catchOpen });
      continue;
    }
    blocks.push({ tryText: source.slice(open, close + 1), catchText: source.slice(catchOpen, catchClose + 1), catchIndex: catchOpen });
  }
  return blocks;
}

const HONEST_CATCH = /\bthrow\b|\b5\d\d\b|errorResponse|serverError|internalError/;

function analyseHandler(entryFile, graph, root) {
  const rel = path.relative(root, entryFile);
  const findings = [];
  const files = [...graph.entries()].map(([file, text]) => ({ file, rel: path.relative(root, file), text, source: stripComments(text) }));
  const combined = files.map((f) => f.source).join('\n');

  // Swallowed send errors: a catch whose try body sends mail must answer 5xx or rethrow.
  for (const f of files) {
    for (const block of tryBlocks(f.source)) {
      if (block.malformedAt !== undefined) {
        findings.push(finding('malformed-surface', 'fail', f.rel, lineOf(f.source, block.malformedAt), 'Braces around a try/catch could not be matched, so the send path could not be verified.', 'Fix the syntax or simplify the block.'));
        continue;
      }
      if (!MAIL_SEND.test(block.tryText)) continue;
      if (!HONEST_CATCH.test(block.catchText)) {
        findings.push(finding('swallowed-send-error', 'fail', f.rel, lineOf(f.source, block.catchIndex), 'The catch around the mail send neither rethrows nor returns a 5xx, so a failed send can still end in a success response and the lead is lost.', 'Return 502 (provider rejected) from the catch and 503 when the mail binding or provider is not configured. Never answer 2xx unless the send call resolved.'));
      }
    }
    for (const match of f.source.matchAll(/\.send\s*\([^;]*?\)\s*\.catch\s*\(/g)) {
      const open = f.source.indexOf('{', match.index + match[0].length);
      const close = open >= 0 ? matchBrace(f.source, open) : -1;
      const body = close > open ? f.source.slice(open, close + 1) : '';
      if (!HONEST_CATCH.test(body)) {
        findings.push(finding('swallowed-send-error', 'fail', f.rel, lineOf(f.source, match.index), 'A promise .catch() on the mail send swallows the failure.', 'Rethrow or return a 5xx from the catch.'));
      }
    }
  }

  if (!/\b50[0-4]\b/.test(combined)) {
    findings.push(finding('no-error-status', 'fail', rel, 1, 'The handler never produces a 5xx status, so it cannot report a missing mail binding or a provider failure honestly.', 'Answer 503 when the mail binding is missing and 502 when the provider rejects the send.'));
  }

  // Logging the payload or fields.
  for (const f of files) {
    for (const match of f.source.matchAll(/\bconsole\s*\.\s*(?:log|info|warn|error|debug)\s*\(/g)) {
      const open = match.index + match[0].length - 1;
      let depth = 0;
      let end = -1;
      for (let i = open; i < Math.min(f.source.length, open + 800); i += 1) {
        if (f.source[i] === '(') depth += 1;
        else if (f.source[i] === ')') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const args = f.source.slice(open, end > 0 ? end : open + 200);
      const stringsRemoved = args
        .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""')
        .replace(/\b(?:err|error|e|ex|exception|mailErr|sendErr|cause|reason)\s*\??\.\s*(?:name|message|code|stack)\b/g, 'ERR');
      if (PAYLOAD_NAMES.test(stringsRemoved) || /\.(?:name|email|phone|message)\b/.test(stringsRemoved)) {
        findings.push(finding('logs-payload', 'fail', f.rel, lineOf(f.source, match.index), 'console.* receives the request body, form data or a personal field (name, email, phone, message). Logs are retained and are not covered by the privacy notice.', 'Log a short non-PII submission id, the topic key and an error code only.'));
      }
    }
  }

  // Returning internal error text to the client.
  for (const f of files) {
    const lines = f.source.split('\n');
    lines.forEach((text, index) => {
      if (!/\b(?:err|error|e|ex|exception|mailErr|sendErr)\b(?:\s+as\s+\w+)?\)?\s*\.\s*(?:message|stack)\b/.test(text)) return;
      if (/\bconsole\s*\./.test(text)) return;
      const around = lines.slice(Math.max(0, index - 3), index + 4).join('\n');
      if (/Response\s*\(|JSON\.stringify|\.json\s*\(|\bjson\s*\(|status\s*:/.test(around)) {
        findings.push(finding('returns-error-message', 'fail', f.rel, index + 1, 'An internal error message or stack is placed in the response, which can leak bindings, addresses and provider details to visitors.', 'Return a fixed, safe message and an error code; log the error class server-side.'));
      }
    });
  }

  if (!BODY_CAP.test(combined)) {
    findings.push(finding('no-body-cap', 'fail', rel, 1, 'No request-size cap (Content-Length check, byte limit or 413) was found in the handler or the files it imports.', 'Reject bodies over a fixed byte cap with 413 before parsing, and count the stream because Content-Length can be absent.'));
  }

  if (CATCHALL.test(combined) && !ALLOWLIST_MARKER.test(combined)) {
    findings.push(finding('no-allowlist', 'fail', rel, 1, 'The handler copies every submitted key (entries or fromEntries) with no allowlist or schema, so a client can add any field to the email.', 'Define the allowed fields with types and max lengths and reject unexpected fields (400/422).'));
  }

  // HTML email built from interpolated values without an escape helper.
  const htmlTemplate = /`[^`]*<[a-zA-Z][^`]*\$\{[^`]*`/;
  if (htmlTemplate.test(combined) && !ESCAPE_HELPER.test(combined)) {
    const strips = /\.replace\(\s*\/<\[\^>\]\*>\/g/.test(combined);
    findings.push(finding('unescaped-html-email', 'fail', rel, 1, `An HTML email is built by interpolating values${strips ? ' (tag stripping is not escaping)' : ''} and no HTML-escape helper exists in the handler.`, 'Escape every dynamic value (& < > " \') before it enters HTML, or send plain text only. Set Reply-To to the visitor and keep From on your own domain.'));
  }

  if (!ORIGIN_CHECK.test(combined)) findings.push(finding('no-origin-check', 'warn', rel, 1, 'No same-origin check (Origin or Sec-Fetch-Site) was found.', 'Reject cross-site posts with 403.'));
  if (!RATE_LIMIT.test(combined)) findings.push(finding('no-rate-limit', 'warn', rel, 1, 'No rate limiting was found for the form endpoint.', 'Add a Workers Rate Limiting binding (and an in-isolate window) keyed by cf-connecting-ip, answering 429 with Retry-After.'));
  if (!SPAM_CONTROL.test(combined)) findings.push(finding('no-spam-control', 'warn', rel, 1, 'No honeypot, time trap or Turnstile was found.', 'Add a honeypot field plus a time-to-submit trap; add Turnstile only if spam appears.'));

  return findings;
}

/* -------------------------------------------------------------------- main */

export function scanProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const findings = [];
  const forms = [];
  const handlers = [];
  const clientFiles = [];
  const malformed = [];

  const markupFiles = [];
  const codeFiles = [];
  walk(root, (file) => {
    const ext = path.extname(file).toLowerCase();
    if (file.endsWith('.d.ts') || file.endsWith('.min.js')) return; // generated typings and bundles are not surfaces
    if (MARKUP_EXT.has(ext)) markupFiles.push(file);
    if (CODE_EXT.has(ext) || ext === '.astro') codeFiles.push(file);
  });

  const cache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, readText(file, malformed, root));
    return cache.get(file);
  };

  for (const file of markupFiles) {
    const text = read(file);
    if (text === null) continue;
    if (!/<form\b/i.test(text) && !/FormData\s*\(/.test(text)) continue;
    const rel = path.relative(root, file);
    const result = scanMarkup(text, rel);
    findings.push(...result.findings);
    forms.push(...result.forms);
    if (result.hasFetchOfFormData) {
      clientFiles.push(rel);
      findings.push(...checkClientStatus(result.source, rel));
    }
  }
  // Client scripts that post FormData but live outside markup files.
  for (const file of codeFiles) {
    if (markupFiles.includes(file)) continue;
    const text = read(file);
    if (text === null || !/FormData\s*\(/.test(text) || !/\bfetch\s*\(/.test(text)) continue;
    const rel = path.relative(root, file);
    clientFiles.push(rel);
    findings.push(...checkClientStatus(stripComments(text), rel));
  }

  const analysed = new Set();
  for (const file of codeFiles) {
    const text = read(file);
    if (text === null) continue;
    const source = stripComments(text);
    if (!POST_EXPORT.test(source)) continue;
    const graph = collectGraph(file, read);
    const combined = [...graph.values()].map(stripComments).join('\n');
    const isHandler = BODY_READ.test(combined) && MAIL_SEND.test(combined);
    if (!isHandler) continue;
    // A library imported by an analysed route is judged through that route; do not report it twice.
    const key = [...graph.keys()].sort().join('|');
    if (analysed.has(key)) continue;
    analysed.add(key);
    handlers.push(path.relative(root, file));
    findings.push(...analyseHandler(file, graph, root));
  }

  findings.push(...malformed);
  if (forms.length === 0 && handlers.length === 0 && clientFiles.length === 0 && malformed.length === 0) {
    findings.push(finding('no-form', 'info', '.', 0, 'No form pages or form handlers were found, so there is nothing to check.', ''));
  }
  if (forms.length > 0 && handlers.length === 0 && !forms.some((f) => /^https?:\/\//i.test(f.action ?? ''))) {
    const posting = forms.filter((f) => f.method === 'post');
    if (posting.length > 0) {
      findings.push(finding('no-handler-found', 'warn', posting[0].file, posting[0].line, 'A POST form exists but no mail-sending handler was found in this project (it may post to an external provider or another repository).', 'Confirm where the form posts and check that service for honest status codes.'));
    }
  }

  const unique = new Map();
  for (const f of findings) unique.set(`${f.rule}|${f.file}|${f.line}|${f.message}`, f);
  return { root, forms, handlers, clientFiles, findings: [...unique.values()] };
}

export function summarize(findings) {
  const count = (severity) => findings.filter((f) => f.severity === severity).length;
  return { fail: count('fail'), warn: count('warn'), info: count('info') };
}
