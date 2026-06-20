// ./Web_Toolkit/privacy_check/src/lib/patterns.mjs
/**
 * Privacy/sanitization patterns for portable export checks.
 */

export const FINDING_PATTERNS = [
  { category: 'secret', label: 'Cloudflare token', pattern: /CLOUDFLARE_API_TOKEN\s*=\s*cf[a-z0-9_\-]{20,}/ig },
  { category: 'secret', label: 'OpenAI key', pattern: /OPENAI_API_KEY\s*=\s*(?:sk|sess)-[^\r\n\s]{12,}/ig },
  { category: 'secret', label: 'Resend key', pattern: /RESEND_API_KEY\s*=\s*re_[^\r\n\s]{10,}/ig },
  { category: 'secret', label: 'PostHog key', pattern: /PUBLIC_POSTHOG_API_KEY\s*=\s*phc_[^\r\n\s]{10,}/ig },
  { category: 'identity', label: 'Email address', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig },
  { category: 'path', label: 'Windows user path', pattern: /[A-Z]:\\Users\\[^\\\s"]+/ig },
  { category: 'path', label: 'Windows user path (JSON escaped)', pattern: /[A-Z]:\\\\Users\\\\[^\s"]+/ig },
  { category: 'path', label: 'POSIX home path', pattern: /\/Users\/[^\/\s"]+/ig },
  { category: 'artifact', label: 'Audit output file', pattern: /(token-audit|site-audit|dns-audit|zone-audit|zone-hardening)-[A-Za-z0-9_.-]+\.json/ig }
];

