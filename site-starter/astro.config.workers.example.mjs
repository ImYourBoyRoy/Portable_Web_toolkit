// ./astro.config.mjs — Workers (SSR) example; copy to project root and set `site` to production URL.
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://your-production-domain.example',
  output: 'server',
  adapter: cloudflare({ imageService: 'compile' }),
});
