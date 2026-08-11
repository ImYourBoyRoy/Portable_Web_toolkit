// ./astro.config.mjs — Pages (static) example; copy to project root and set `site` to production URL.
import { defineConfig } from 'astro/config';

/**
 * Image policy (toolkit default):
 * - Use Astro `Image` / `Picture` from `astro:assets` for content photos (build-time Sharp).
 * - Prefer `<Picture formats={['avif','webp']}>` (see `src/components/OptimizedPicture.astro`).
 * - Use image-pipeline only for leftover rasters under `public/` that bypass Astro.
 */
export default defineConfig({
  site: 'https://your-production-domain.example',
  output: 'static',
  image: {
    // Sharp is Astro’s default local service (enabled via allowScripts.sharp).
    // Remote hosts must be listed explicitly when fetching off-site images.
    domains: [],
    remotePatterns: []
  }
});
