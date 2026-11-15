// ./src/lib/discovery/negotiate.ts
/**
 * `Accept: text/markdown` content negotiation for page URLs.
 * A page URL such as /about/ answers with its Markdown twin (/about/index.md) when the client names text/markdown
 * and ranks it above HTML. Responses carry `Vary: Accept`, a canonical Link back to the HTML page and `Content-Location`.
 * Used by src/worker.ts (prerendered pages never reach Astro middleware) and src/middleware.ts (SSR responses).
 * Browsers send text/html first, so they never see Markdown; a bare `*` + `/` + `*` (curl default) also gets HTML.
 */
import { canonicalUrl, markdownPathFor } from './site';

interface MediaRange { type: string; q: number }

const parseAccept = (accept: string): MediaRange[] =>
  accept.split(',').map((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(';').map((piece) => piece.trim());
    const q = params.find((param) => param.startsWith('q='));
    const quality = q ? Number.parseFloat(q.slice(2)) : 1;
    return { type: type ?? '', q: Number.isFinite(quality) ? quality : 0 };
  }).filter((range) => range.type);

const qualityFor = (ranges: MediaRange[], type: string, allowWildcard: boolean): number => {
  const exact = ranges.find((range) => range.type === type);
  if (exact) return exact.q;
  if (!allowWildcard) return 0;
  const group = ranges.find((range) => range.type === `${type.split('/')[0]}/*`);
  if (group) return group.q;
  return ranges.find((range) => range.type === '*/*')?.q ?? 0;
};

/** True when text/markdown is named explicitly and ranks above HTML. */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept || !accept.toLowerCase().includes('markdown')) return false;
  const ranges = parseAccept(accept);
  const markdown = qualityFor(ranges, 'text/markdown', false);
  if (markdown <= 0) return false;
  const html = Math.max(qualityFor(ranges, 'text/html', true), qualityFor(ranges, 'application/xhtml+xml', true));
  return markdown > html;
}

/** Page-like paths: no file extension, not under /api/ or /.well-known/. */
export const isPagePath = (pathname: string): boolean =>
  !pathname.startsWith('/api/') && !pathname.startsWith('/.well-known/') && !/\.[a-z0-9]+$/i.test(pathname);

interface AssetFetcher { fetch(request: Request): Promise<Response> }

/** Returns the Markdown twin response for a negotiated request, or null to continue with HTML. */
export async function negotiateMarkdown(request: Request, assets: AssetFetcher | undefined): Promise<Response | null> {
  if (!assets || (request.method !== 'GET' && request.method !== 'HEAD')) return null;
  if (!prefersMarkdown(request.headers.get('accept'))) return null;

  const url = new URL(request.url);
  if (!isPagePath(url.pathname)) return null;

  const markdownPath = markdownPathFor(url.pathname);
  const twin = await assets.fetch(new Request(new URL(markdownPath, url.origin), { method: request.method }));
  if (!twin.ok) return null;

  const headers = new Headers(twin.headers);
  headers.set('Content-Type', 'text/markdown; charset=utf-8');
  headers.set('Vary', 'Accept');
  headers.set('Content-Location', markdownPath);
  headers.set('Link', `<${canonicalUrl(url.origin, url.pathname)}>; rel="canonical"`);
  return new Response(request.method === 'HEAD' ? null : twin.body, { status: 200, headers });
}
