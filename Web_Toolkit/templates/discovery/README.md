# Discovery Generator Templates

Copy these reference files into a client site's `src/` tree when bootstrapping the Zenith discovery layer.

- `lib/metadata-extractor.ts` → `src/lib/metadata-extractor.ts`
- `pages/robots.txt.ts` → `src/pages/robots.txt.ts`
- `pages/sitemap.xml.ts` → `src/pages/sitemap.xml.ts`
- `pages/llms.txt.ts` → `src/pages/llms.txt.ts`
- `pages/llms-full.txt.ts` → `src/pages/llms-full.txt.ts`

## Conventions

- Use Astro's configured `site` URL as the canonical base. Do not hardcode client domains in toolkit source.
- Extend static page discovery with your project's content collections, CMS data, or database queries.
- Keep preview/staging deployments on `Disallow: /` or equivalent noindex posture.

See `AGENTS.md` § discovery rules and `discovery_doctor/README.md` for verification expectations.
