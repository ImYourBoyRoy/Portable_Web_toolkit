# Discovery Generator Templates

Generic, copy-ready Zenith discovery layer for Astro + Cloudflare client sites. **No client domains or sample business data** — customize `site-config.ts` per project.

## Copy map

| Toolkit path | Client destination |
|--------------|-------------------|
| `lib/site-config.ts` | `src/lib/site-config.ts` |
| `lib/metadata-extractor.ts` | `src/lib/metadata-extractor.ts` |
| `lib/discovery/site.ts` | `src/lib/discovery/site.ts` |
| `lib/discovery/routes.ts` | `src/lib/discovery/routes.ts` |
| `pages/robots.txt.ts` | `src/pages/robots.txt.ts` |
| `pages/sitemap.xml.ts` | `src/pages/sitemap.xml.ts` |
| `pages/llms.txt.ts` | `src/pages/llms.txt.ts` |
| `pages/llms-full.txt.ts` | `src/pages/llms-full.txt.ts` |
| `pages/humans.txt.ts` | `src/pages/humans.txt.ts` |
| `pages/.well-known/security.txt.ts` | `src/pages/.well-known/security.txt.ts` |
| `pages/api/content.json.ts` | `src/pages/api/content.json.ts` |
| `pages/api/search.json.ts` | `src/pages/api/search.json.ts` |
| `components/Schema.astro` | `src/components/Schema.astro` |
| `src/middleware.ts` | `src/middleware.ts` (Workers SSR) |

Optional structural CSS (no brand lock-in): copy from [`../../site-starter/src/styles/`](../site-starter/src/styles/).

## Setup

1. Set `site` in `astro.config.mjs` to the production URL (canonical discovery base).
2. Edit `src/lib/site-config.ts` — name, description, `contactEmail`, optional `credits`.
3. Optionally set `PUBLIC_SECURITY_CONTACT` in project `.env` for `security.txt`.
4. Import `<Schema />` from your root layout; pass page `title` / `description` when needed.
5. Use `<Layout title="..." description="..." />` or frontmatter so metadata extraction works.

## Conventions

- **Environment-aware:** preview/staging hosts get `Disallow: /` in robots and no production `security.txt`.
- **Custom generators only** — never `@astrojs/sitemap` / `@astrojs/robots`.
- Extend `routes.ts` with content collections or CMS data when glob-scan is not enough.
- **`search.json`** is SSR (`prerender: false`) — verify on live URL after deploy, not only in static `dist/`.

## Verify

```bash
npm run build
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist/client   # Workers
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist          # Pages static
```

See `AGENTS.md` discovery rules and `discovery_doctor/README.md`.
