// ./Web_Toolkit/privacy_check/src/lib/patterns.mjs
/**
 * Privacy/sanitization patterns for portable export checks.
 */

// After "=" only allow same-line horizontal whitespace. Using \s* here lets
// empty KEY= lines falsely match the next line's long identifier (e.g.
// CLOUDFLARE_API_TOKEN=\nGOOGLE_PAGESPEED_API_KEY=).
const EQ = String.raw`[^\S\r\n]*=[^\S\r\n]*`;

export const FINDING_PATTERNS = [
  { category: 'secret', label: 'Cloudflare token', pattern: new RegExp(String.raw`CLOUDFLARE_API_TOKEN${EQ}[A-Za-z0-9_-]{20,}`, 'ig') },
  { category: 'secret', label: 'Cloudflare account ID', pattern: new RegExp(String.raw`CLOUDFLARE_ACCOUNT_ID${EQ}[a-f0-9]{32}`, 'ig') },
  { category: 'secret', label: 'Porkbun API key', pattern: new RegExp(String.raw`(?:PORKBUN_API_KEY|PORKBUN_SECRET_KEY)${EQ}(?:pk1_|sk1_)[^\r\n\s]{10,}`, 'ig') },
  { category: 'secret', label: 'GitHub token', pattern: new RegExp(String.raw`(?:GH_TOKEN|GITHUB_TOKEN)${EQ}(?:ghp_[^\r\n\s]{20,}|github_pat_[^\r\n\s]{20,})`, 'ig') },
  { category: 'secret', label: 'OpenAI key', pattern: new RegExp(String.raw`OPENAI_API_KEY${EQ}(?:sk|sess)-[^\r\n\s]{12,}`, 'ig') },
  { category: 'secret', label: 'Resend key', pattern: new RegExp(String.raw`RESEND_API_KEY${EQ}re_[^\r\n\s]{10,}`, 'ig') },
  { category: 'secret', label: 'PostHog key', pattern: new RegExp(String.raw`PUBLIC_POSTHOG_API_KEY${EQ}phc_[^\r\n\s]{10,}`, 'ig') },
  { category: 'secret', label: 'Google Analytics ID', pattern: new RegExp(String.raw`(?:GA_MEASUREMENT_ID|PUBLIC_GA_ID|GOOGLE_ANALYTICS_ID|PUBLIC_GA_MEASUREMENT_ID)${EQ}(?:G-[A-Z0-9]+|UA-\d+-\d+)`, 'ig') },
  { category: 'secret', label: 'Turnstile secret', pattern: new RegExp(String.raw`(?:TURNSTILE_SECRET_KEY|CLOUDFLARE_TURNSTILE_SECRET)${EQ}0x[A-Za-z0-9_-]{20,}`, 'ig') },
  { category: 'secret', label: 'Turnstile site key', pattern: new RegExp(String.raw`(?:PUBLIC_TURNSTILE_SITE_KEY|TURNSTILE_SITE_KEY)${EQ}0x[A-Za-z0-9_-]{20,}`, 'ig') },
  { category: 'identity', label: 'Email address', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig },
  { category: 'path', label: 'Windows user path', pattern: /[A-Z]:\\Users\\[^\\\s"]+/ig },
  { category: 'path', label: 'Windows user path (JSON escaped)', pattern: /[A-Z]:\\\\Users\\\\[^\s"]+/ig },
  { category: 'path', label: 'POSIX home path', pattern: /\/Users\/[^\/\s"]+/ig },
  { category: 'artifact', label: 'Audit output file', pattern: /(token-audit|site-audit|dns-audit|zone-audit|zone-hardening)-[A-Za-z0-9_.-]+\.json/ig }
];

