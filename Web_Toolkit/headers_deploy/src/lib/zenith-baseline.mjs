// ./Web_Toolkit/headers_deploy/src/lib/zenith-baseline.mjs
/**
 * Zenith baseline Cloudflare Pages `_headers` cache rules and security header sets.
 */

export const MANAGED_PUBLIC_START = '# portable-headers-deploy: cache-baseline:start';
export const MANAGED_PUBLIC_END = '# portable-headers-deploy: cache-baseline:end';
export const GENERATOR_TAG = 'headers-deploy';

export const REQUIRED_DIST_HEADERS = [
  'Strict-Transport-Security',
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
];

const CSP_PRESETS = {
  'astro-static': {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
    'img-src': ["'self'", 'data:', 'https:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'style-src': ["'self'", "'unsafe-inline'"],
    'script-src': ["'self'", "'unsafe-inline'", 'https://static.cloudflareinsights.com'],
    'connect-src': ["'self'", 'https://static.cloudflareinsights.com'],
    'upgrade-insecure-requests': [],
  },
  'astro-analytics': {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'self'"],
    'object-src': ["'none'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      'https://static.cloudflareinsights.com',
      'https://www.googletagmanager.com',
      'https://us-assets.i.posthog.com',
    ],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'img-src': ["'self'", 'data:', 'blob:', 'https://www.google-analytics.com'],
    'connect-src': [
      "'self'",
      'https://www.google-analytics.com',
      'https://region1.google-analytics.com',
      'https://us.i.posthog.com',
    ],
    'worker-src': ["'self'", 'blob:'],
  },
};

function directiveValue(values) {
  if (!values || values.length === 0) return '';
  return values.join(' ');
}

function mergeDirectiveMaps(base, overrides = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (Array.isArray(value)) {
      merged[key] = value;
    } else if (typeof value === 'string') {
      merged[key] = value.split(/\s+/).filter(Boolean);
    }
  }
  return merged;
}

export function buildContentSecurityPolicy(headersConfig = {}) {
  const presetName = headersConfig.preset || 'astro-static';
  const preset = CSP_PRESETS[presetName] || CSP_PRESETS['astro-static'];
  const directives = mergeDirectiveMaps(preset, headersConfig.csp?.directives || headersConfig.csp || {});

  return Object.entries(directives)
    .map(([name, values]) => {
      const body = directiveValue(values);
      return body ? `${name} ${body}` : name;
    })
    .join('; ');
}

export function buildPublicCacheBaseline(headersConfig = {}) {
  const ogImagePath = headersConfig.ogImagePath || '/assets/og-image.png';
  return [
    MANAGED_PUBLIC_START,
    '# Performance cache baseline for Cloudflare Pages / Workers static assets',
    '',
    `# OG / social image — short revalidation so previews refresh`,
    ogImagePath,
    '  Cache-Control: public, max-age=0, must-revalidate',
    '',
    '# Immutable hashed Astro bundles',
    '/_astro/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '# Long-lived static media',
    '/*.png',
    '  Cache-Control: public, max-age=31536000',
    '/*.jpg',
    '  Cache-Control: public, max-age=31536000',
    '/*.jpeg',
    '  Cache-Control: public, max-age=31536000',
    '/*.webp',
    '  Cache-Control: public, max-age=31536000',
    '/*.avif',
    '  Cache-Control: public, max-age=31536000',
    '/*.svg',
    '  Cache-Control: public, max-age=31536000',
    '/*.ico',
    '  Cache-Control: public, max-age=31536000',
    '',
    '# Self-hosted fonts',
    '/*.woff2',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '# HTML should revalidate quickly',
    '/*.html',
    '  Cache-Control: public, max-age=0, must-revalidate',
    MANAGED_PUBLIC_END,
  ].join('\n');
}

export function upsertManagedBlock(current = '', blockBody = '') {
  const value = String(current || '').trim();
  const body = String(blockBody || '').trim();
  if (!body) return value ? `${value}\n` : '';
  if (!value) return `${body}\n`;
  const pattern = new RegExp(`${escapeRegExp(MANAGED_PUBLIC_START)}[\\s\\S]*?${escapeRegExp(MANAGED_PUBLIC_END)}\\n?`, 'm');
  if (pattern.test(value)) {
    return `${value.replace(pattern, body).trim()}\n`;
  }
  return `${value}\n\n${body}\n`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildDeploySecurityBlock({ environment = 'production', headersConfig = {} } = {}) {
  const isDevelopment = String(environment).toLowerCase() === 'development';
  const csp = buildContentSecurityPolicy(headersConfig);
  const hstsParts = [`max-age=${headersConfig.hstsMaxAge || 31536000}`];
  if (headersConfig.includeSubdomains !== false) hstsParts.push('includeSubDomains');
  if (headersConfig.preloadHsts === true) hstsParts.push('preload');

  const lines = [
    '# Managed deployment security headers',
    `# Generated by ${GENERATOR_TAG}`,
    '/*',
    `  Content-Security-Policy: ${csp}`,
    `  Strict-Transport-Security: ${hstsParts.join('; ')}`,
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()',
  ];

  if (isDevelopment && headersConfig.developmentNoIndex !== false) {
    lines.push('  X-Robots-Tag: noindex, nofollow, noarchive');
  }

  return `${lines.join('\n')}\n`;
}

export function CLOUDFLARE_ENHANCEMENT_STACK() {
  return [
    {
      phase: 'Source baseline',
      command: 'headers-deploy scaffold-public --site-profile <profile> --apply',
      note: 'Writes managed cache rules to public/_headers.',
    },
    {
      phase: 'Post-build deploy file',
      command: 'headers-deploy write-deploy --site-profile <profile> --environment production',
      note: 'Merges security headers + public/_headers into dist output before wrangler deploy.',
    },
    {
      phase: 'Build audit',
      command: 'discovery-doctor ./dist',
      note: 'Confirms HSTS/CSP/nosniff exist in built _headers.',
    },
    {
      phase: 'Zone hardening',
      command: 'cf-agent site harden --site-profile <profile>',
      note: 'Dry-run first. Applies HTTPS, TLS, HSTS zone setting, brotli, HTTP/3, early hints.',
    },
    {
      phase: 'Rules audit',
      command: 'cf-agent rules audit --site-profile <profile>',
      note: 'Checks redirect/cache/header/WAF rulesets.',
    },
    {
      phase: 'Performance switches',
      command: 'cf-agent performance audit --site-profile <profile>',
      note: 'JSON audit of Cloudflare speed-related zone posture.',
    },
    {
      phase: 'Live smoke',
      command: 'site-quality-smoke run --site-profile <profile>',
      note: 'Verifies live CSP, HSTS, routes, sitemap, and asset cache headers.',
    },
    {
      phase: 'Post-deploy purge',
      command: 'cache-purge --site-profile <profile> --apply',
      note: 'Purge edge cache after header or asset changes.',
    },
  ];
}
