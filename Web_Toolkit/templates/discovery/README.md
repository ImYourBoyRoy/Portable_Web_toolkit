# Discovery Generator Templates

Generic, copy-ready discovery layer for Astro + Cloudflare client sites. **No
client domains or sample business data** — customize `site-config.ts` per
project and declare any public API/MCP contract in the site profile.

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

Optional structural CSS (no brand lock-in) lives in
[`../../site-starter/src/styles/`](../site-starter/src/styles/).

## Setup

1. Set `site` in `astro.config.mjs` to the production URL (canonical discovery
   base).
2. Edit `src/lib/site-config.ts` — name, description, `contactEmail`, optional
   `securityPolicyUrl`, `publicDiscovery` links, and credits.
3. Set `PUBLIC_SECURITY_CONTACT` in the project `.env` when the security
   contact should come from deployment configuration.
4. Import `<Schema />` from the root layout; pass page `title` and
   `description` when needed.
5. Use `<Layout title="..." description="..." />` or frontmatter so metadata
   extraction remains useful.
6. If the site publishes a custom REST catalog/search API or MCP endpoint,
   describe it in `diagnostics.discovery.endpoints` in the site profile and
   optionally add a public documentation link to `siteConfig.publicDiscovery`.
   The toolkit stays generic and does not infer private or user-scoped routes.

## Output contracts

### `llms.txt`

The generator emits the current llms.txt v2 shape: one H1, a short blockquote
summary, H2 sections, and Markdown links. Links are absolute when Astro’s
`site` is configured and safe root-relative links otherwise. Keep this file a
concise public index. It may link to public REST/MCP documentation, but it must
not contain answers, notes, profiles, sessions, shares, emails, credentials, or
user-scoped URLs.

`llms-full.txt` is part of the default toolkit discovery contract and provides
expanded context. A site profile may explicitly relax it. It may contain prose
and page metadata, but it inherits the same link and secret-safety boundary. Neither
file grants authorization; authenticated access belongs behind OAuth or another
server-enforced user session.

### `security.txt`

The template emits `Contact` and a build-time `Expires` value 180 days in the
future. `Policy` is emitted only when `securityPolicyUrl` is an absolute HTTP(S)
URI; RFC 9116 does not allow free-form policy prose in that field. Preview and
staging hosts return 404 through the environment-aware generator.

### Sitemap and robots

The sitemap generator escapes XML text and excludes admin/API/discovery helper
routes. Production robots allows crawling and references the sitemap; preview
robots uses `Disallow: /` and `X-Robots-Tag: noindex`. Robots is not a security
boundary: protect private data with authentication and authorization.

## Verify

```bash
npm run build
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist/client --site-profile ./site.site-profile.json
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist --site-profile ./site.site-profile.json
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs https://example.com --site-profile ./site.site-profile.json
```

The local run validates generated files and reports SSR/MCP routes as
runtime-only when they are absent from `dist`. The live run validates deployed
status, content type, same-origin discovery links, and public MCP discovery/list
methods without invoking tools. PageSpeed Insights remains the place to check
performance and Core Web Vitals; it is not an llms.txt validator.

See [`../../discovery_doctor/README.md`](../../discovery_doctor/README.md) and
the project `AGENTS.md` for policy and release gates.
