// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/analytics/patchers.mjs
/**
 * Source patchers for middleware, layout, and env typing updates.
 */

import { REQUIRED_CSP_TOKENS } from './constants.mjs';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeDirectiveTokens(value, requiredTokens) {
  const tokens = String(value).trim().split(/\s+/).filter(Boolean);
  for (const token of requiredTokens) {
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens.join(' ');
}

function upsertCspDirective(source, directive, requiredTokens) {
  const dynamicMarkerByDirective = {
    'script-src': 'cspScriptSrc.join',
    'connect-src': 'cspConnectSrc.join',
    'img-src': 'cspImgSrc.join'
  };
  const dynamicMarker = dynamicMarkerByDirective[directive];
  if (dynamicMarker && source.includes(dynamicMarker)) {
    return { content: source, changed: false, notes: [] };
  }

  const directivePattern = new RegExp(`([\"'\\\`])${escapeRegExp(directive)}\\s+([^\"'\\\`]+)\\1`);
  if (directivePattern.test(source)) {
    let changed = false;
    const content = source.replace(directivePattern, (full, quote, value) => {
      const merged = mergeDirectiveTokens(value, requiredTokens);
      if (merged === value.trim()) return full;
      changed = true;
      return `${quote}${directive} ${merged}${quote}`;
    });
    return { content, changed };
  }

  const cspArrayPattern = /response\.headers\.set\(\s*['"]content-security-policy['"]\s*,\s*\[([\s\S]*?)\]\.join\(\s*['"];\s*['"]\s*\)\s*\)/m;
  const blockMatch = source.match(cspArrayPattern);
  if (!blockMatch) {
    return { content: source, changed: false, notes: [`Unable to locate CSP array for ${directive}.`] };
  }

  const fullBlock = blockMatch[0];
  const arrayBody = blockMatch[1];
  const addition = `      "${directive} ${requiredTokens.join(' ')}",\n`;
  const trimmedArray = arrayBody.replace(/\s+$/, '');
  const nextArray = `${trimmedArray}\n${addition}`;
  const nextBlock = fullBlock.replace(arrayBody, nextArray);
  return {
    content: source.replace(fullBlock, nextBlock),
    changed: true,
    notes: [`Inserted missing CSP directive: ${directive}.`]
  };
}

export function patchMiddlewareSource(source) {
  let content = source;
  let changed = false;
  const notes = [];

  for (const [directive, tokens] of Object.entries(REQUIRED_CSP_TOKENS)) {
    const update = upsertCspDirective(content, directive, tokens);
    if (update.changed) {
      content = update.content;
      changed = true;
    }
    if (Array.isArray(update.notes) && update.notes.length > 0) {
      notes.push(...update.notes);
    }
  }

  return { content, changed, notes };
}

export function patchLayoutSource(source) {
  const frontmatterStart = source.indexOf('---');
  if (frontmatterStart !== 0) {
    return { content: source, changed: false, notes: ['Layout frontmatter not found at file start.'] };
  }
  const frontmatterEnd = source.indexOf('\n---', 3);
  if (frontmatterEnd < 0) {
    return { content: source, changed: false, notes: ['Layout frontmatter closing marker not found.'] };
  }

  const frontmatter = source.slice(3, frontmatterEnd);
  let nextFrontmatter = frontmatter;
  let changed = false;

  if (!/from\s+["']@\/components\/ga4\.astro["']/.test(frontmatter)) {
    nextFrontmatter = `${nextFrontmatter}\nimport GA4 from "@/components/ga4.astro";`;
    changed = true;
  }
  if (!/from\s+["']@\/components\/posthog\.astro["']/.test(frontmatter)) {
    nextFrontmatter = `${nextFrontmatter}\nimport PostHog from "@/components/posthog.astro";`;
    changed = true;
  }

  let body = source.slice(frontmatterEnd + 4);
  if (!/<GA4\s*\/>/.test(body) || !/<PostHog\s*\/>/.test(body)) {
    if (/<SEOHead\b[^>]*\/>/.test(body)) {
      body = body.replace(/(<SEOHead\b[^>]*\/>)/, '$1\n    <GA4 />\n    <PostHog />');
      changed = true;
    } else if (/<head[^>]*>/.test(body)) {
      body = body.replace(/(<head[^>]*>)/, '$1\n    <GA4 />\n    <PostHog />');
      changed = true;
    } else {
      return {
        content: source,
        changed,
        notes: ['No <head> or <SEOHead /> node found for analytics injection.']
      };
    }
  }

  if (!changed) {
    return { content: source, changed: false };
  }

  return { content: `---${nextFrontmatter}\n---${body}`, changed: true };
}

export function patchEnvTypingSource(source) {
  let content = source;
  let changed = false;
  const requiredLines = [
    '  readonly PUBLIC_ANALYTICS_ENABLED?: string;',
    '  readonly PUBLIC_GA4_MEASUREMENT_ID?: string;',
    '  readonly PUBLIC_POSTHOG_API_KEY?: string;',
    '  readonly PUBLIC_POSTHOG_API_HOST?: string;'
  ];

  if (/interface\s+ImportMetaEnv\s*{/.test(content)) {
    content = content.replace(/interface\s+ImportMetaEnv\s*{([\s\S]*?)}/m, (_full, body) => {
      let nextBody = body;
      for (const line of requiredLines) {
        if (!body.includes(line.trim())) {
          nextBody = `${nextBody}\n${line}`;
          changed = true;
        }
      }
      return `interface ImportMetaEnv {${nextBody}\n}`;
    });
  } else {
    const snippet = [
      'interface ImportMetaEnv {',
      ...requiredLines,
      '}',
      '',
      'interface ImportMeta {',
      '  readonly env: ImportMetaEnv;',
      '}',
      ''
    ].join('\n');
    content = /export\s*{}\s*;/.test(content)
      ? content.replace(/export\s*{}\s*;/, (match) => `${match}\n\n${snippet}`)
      : `${snippet}${content}`;
    changed = true;
  }

  if (!/interface\s+ImportMeta\s*{[\s\S]*?\benv\s*:\s*ImportMetaEnv;[\s\S]*?}/m.test(content)) {
    content = `${content}\ninterface ImportMeta {\n  readonly env: ImportMetaEnv;\n}\n`;
    changed = true;
  }

  return { content, changed };
}

