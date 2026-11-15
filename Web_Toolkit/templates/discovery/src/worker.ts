// ./src/worker.ts
/**
 * Worker entry (wrangler.toml `main`). Wraps Astro's Cloudflare handler with `Accept: text/markdown` negotiation.
 * Why a custom entry: prerendered pages are static assets, so Astro middleware never runs for them, and the assets layer
 * cannot branch on the Accept header. wrangler.toml sends only page routes through this Worker (`assets.run_worker_first`);
 * images, fonts and /_astro/* keep being served directly.
 * To disable negotiation, remove `main` and `run_worker_first` from wrangler.toml. Markdown twins and Link headers keep working.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { negotiateMarkdown } from './lib/discovery/negotiate';

type Env = { ASSETS?: { fetch(request: Request): Promise<Response> } } & Record<string, unknown>;

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const markdown = await negotiateMarkdown(request, env.ASSETS);
    if (markdown) return markdown;
    return handle(request as never, env as never, context as never) as Promise<Response>;
  }
};
