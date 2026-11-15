// ./src/lib/discovery/ratelimit.ts
/**
 * Per-IP rate limiting for the public read APIs, using the Workers Rate Limiting binding (API_RATE_LIMIT, see
 * wrangler.discovery.snippet.toml). Limit and period live in wrangler.toml (default 60 requests per 60 seconds).
 * Edit `groupFor` to add routes (a GitHub-backed or compute-heavy API is a good candidate).
 * Fails open: when the binding is missing (astro dev, tests) or errors, the request goes through.
 * Counters are per Cloudflare location and eventually consistent: this stops loops and scrapers, it is not a billing-grade quota.
 */

interface RateLimiter { limit(options: { key: string }): Promise<{ success: boolean }> }

const groupFor = (pathname: string, method: string): string | null => {
  if (method === 'OPTIONS' || method === 'HEAD') return null;
  if (pathname === '/api/mcp') return 'mcp';
  if (pathname === '/api/search.json') return 'search';
  return null;
};

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export async function checkRateLimit(request: Request, pathname: string, limiter: RateLimiter | undefined): Promise<Response | null> {
  const group = groupFor(pathname, request.method);
  if (!group || !limiter) return null;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    const { success } = await limiter.limit({ key: `${group}:${ip}` });
    if (success) return null;
  } catch {
    return null;
  }
  return new Response(JSON.stringify({
    error: 'rate_limited',
    message: 'Too many requests. Wait a minute and retry. Every page is also available as one document at /site.md.',
    retryAfterSeconds: 60
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': '60',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
