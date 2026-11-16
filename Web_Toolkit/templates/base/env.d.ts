// ./src/env.d.ts: types for Astro, the Cloudflare adapter, and the toolkit templates' public environment variables.
/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare" />

interface ImportMetaEnv {
  /** Staging/preview builds set this to anything but "production": the layout then emits noindex. */
  readonly PUBLIC_SITE_ENV?: string;
  readonly PUBLIC_SECURITY_CONTACT?: string;
  readonly PUBLIC_GA4_ID?: string;
  readonly PUBLIC_POSTHOG_KEY?: string;
  readonly PUBLIC_POSTHOG_HOST?: string;
  readonly PUBLIC_CF_BEACON_TOKEN?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Workers runtime pieces the templates touch, declared narrowly on purpose. Loading @cloudflare/workers-types globally
// merges its HTMLRewriter-style Element/Document types into the DOM lib and breaks ordinary client code
// (document.head.append(script), querySelector<HTMLSelectElement>). For full binding types generate them without the
// runtime: `pnpm exec wrangler types --include-runtime false`, which writes worker-configuration.d.ts (Env only).
declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env & Record<string, any>;
}

declare namespace Cloudflare {
  // Declaration merging: add your bindings/secrets here (or let `wrangler types` do it).
  interface Env {
    TURNSTILE_SECRET_KEY?: string;
    EMAIL?: { send(message: Record<string, unknown>): Promise<unknown> };
  }
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
