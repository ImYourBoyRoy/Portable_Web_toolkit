// ./astro.config.mjs — Workers (SSR) example; copy to project root and set `site` to production URL.
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

/**
 * Image policy (toolkit default):
 * - Cloudflare adapter `imageService: 'compile'` → Sharp at build for prerendered assets.
 * - Use Astro `Image` / `Picture` from `astro:assets` (see `src/components/OptimizedPicture.astro`).
 * - Prefer `<Picture formats={['avif','webp']}>` for photographic content.
 * - Use image-pipeline only for leftover rasters under `public/` that bypass Astro.
 */
export default defineConfig({
  site: 'https://your-production-domain.example',
  output: 'server',
  adapter: cloudflare({ imageService: 'compile' }),
  image: {
    domains: [],
    remotePatterns: []
  }
});
