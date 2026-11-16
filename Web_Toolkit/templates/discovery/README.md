# Discovery Generator Templates

Generic, copy-ready discovery layer for Astro + Cloudflare client sites. **No
client domains or sample business data** — customize `site-config.ts` per
project and declare any public API/MCP contract in the site profile.

## Copy map

Paths are relative to this template folder (`Web_Toolkit/templates/discovery/`).

| Template path | Client destination | Notes |
|---|---|---|
| `lib/site-config.ts` | `src/lib/site-config.ts` | identity, `aiPolicy`, `sameAs`, `apis`, `crawlerDisallow` |
| `lib/metadata-extractor.ts` | `src/lib/metadata-extractor.ts` | |
| `lib/site.ts` | `src/lib/discovery/site.ts` | host rules and canonical URL helpers |
| `lib/routes.ts` | `src/lib/discovery/routes.ts` | route index (slash-canonical paths, git dates, Markdown twin paths) |
| `lib/ai-policy.ts` | `src/lib/discovery/ai-policy.ts` | robots.txt AI groups from `siteConfig.aiPolicy` |
| `lib/negotiate.ts` | `src/lib/discovery/negotiate.ts` | `Accept: text/markdown` logic (Workers) |
| `lib/ratelimit.ts` | `src/lib/discovery/ratelimit.ts` | per-IP limit for public APIs (Workers) |
| `pages/robots.txt.ts`, `pages/sitemap.xml.ts`, `pages/llms.txt.ts`, `pages/llms-full.txt.ts`, `pages/humans.txt.ts`, `pages/ai.txt.ts` | `src/pages/` | |
| `pages/.well-known/security.txt.ts`, `pages/.well-known/api-catalog.ts` | `src/pages/.well-known/` | |
| `pages/api/content.json.ts`, `pages/api/search.json.ts` | `src/pages/api/` | |
| `components/Schema.astro` | `src/components/Schema.astro` | one `@graph` with stable `@id`s |
| `src/middleware.ts` | `src/middleware.ts` | Workers SSR: security headers, rate limit, Link on API JSON |
| `src/worker.ts` + `wrangler.discovery.snippet.toml` | `src/worker.ts`, merge the snippet into `wrangler.toml` | Workers only: `Accept: text/markdown` for prerendered pages |
| `scripts/*.mjs`, `scripts/lib/html-to-markdown.mjs` | `scripts/` | page dates, Markdown twins, whole-site bundle, `_headers` Link rules, consistency check |
| `optional/mcp/**` | same paths under `src/` | optional read-only MCP server and server card |

The `package.json` scripts in `site-starter/*.package.json` already wire the scripts in: `prebuild` refreshes dates,
`build:headers:prod` ends with `discovery-postbuild.mjs`, and `npm run discovery:check` runs the consistency gate.

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
6. Decide the AI policy in `siteConfig.aiPolicy` (`search`, `aiInput`, `aiTrain`). It becomes `Content-Signal` in robots.txt,
   named crawler groups (training crawlers are blocked when `aiTrain` is false), and ai.txt. List form handlers and redirect
   routes in `crawlerDisallow`. List public APIs in `apis` (and `openapiPath` if you publish an OpenAPI file) for
   `/.well-known/api-catalog`.
7. Workers sites: merge `wrangler.discovery.snippet.toml` into `wrangler.toml` and list your top-level page sections in
   `run_worker_first`. Put the `main` key above every `[table]`, and put `[assets]` after all top-level keys (a key written
   after a table header belongs to that table). Pages (static) sites skip the Worker, rate limit and negotiation; they still
   get twins, Link headers, the API catalog and the bundle.
8. If the site publishes a custom REST catalog/search API or MCP endpoint,
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

The sitemap generator escapes XML text, emits trailing-slash canonical URLs, omits `changefreq`/`priority` (Google ignores
them) and unknown `lastmod` dates, and excludes admin/API/error/discovery helper routes. Production robots allows crawling and references the sitemap; preview
robots uses `Disallow: /` and `X-Robots-Tag: noindex`. Robots is not a security
boundary: protect private data with authentication and authorization.

### Canonical URLs and dates

Every page route is emitted with a trailing slash (`/about/`): that is what Astro prerenders, what Cloudflare serves
(`/about` answers 307 to `/about/`, so both URLs work), and what `<link rel="canonical">` says. The sitemap, content.json,
search.json, llms.txt and JSON-LD all use that form through `canonicalPagePath()`. Dates never use the build clock:
`scripts/refresh-page-lastmod.mjs` writes `src/data/page-lastmod.json` from git history, and a page without a known date
omits `lastmod`.
If a repo's first commit is only an import checkpoint, add `src/data/page-lastmod-baseline.json` (`{ "commit": "<hash>", "pages": { "/about/": "YYYY-MM-DD" } }`) so unchanged pages keep their real dates instead of the checkpoint day.

### Agent layer

| Output | Produced by | Purpose |
|---|---|---|
| `<page>/index.md` for each prerendered page | `scripts/discovery-postbuild.mjs` | Markdown twin converted from the built HTML (cannot drift) |
| `/site.md`, `/api/site.json` | same | the whole site in one request |
| `Link` + `Vary: Accept` rules in `_headers` | same | `rel=canonical`, markdown alternate, api-catalog, service-desc, describedby |
| `Accept: text/markdown` negotiation | `src/worker.ts` | prerendered pages answer Markdown to agents that ask |
| `/.well-known/api-catalog` | `pages/.well-known/api-catalog.ts` | RFC 9727 linkset of `siteConfig.apis` |
| `/robots.txt`, `/ai.txt` | `lib/ai-policy.ts` | explicit AI crawler policy |
| `/api/mcp`, `/.well-known/mcp/server-card.json` | `optional/mcp/**` | optional read-only MCP server (search, list, read page, read site) |

Server-rendered pages (`export const prerender = false`) have no static HTML, so they get no twin; content.json omits their
`markdownUrl` and llms.txt links their HTML.
Which pages are prerendered is decided in `src/lib/discovery/routes.ts`: an explicit `export const prerender = true|false` wins, and
`DEFAULT_PRERENDER` covers the rest. Set it to `false` for `output: 'server'` sites (Astro renders those pages on demand unless they
opt in) and `true` for `output: 'static'`. A wrong value makes the post-build step fail loudly instead of publishing a broken Markdown URL.
The consistency check (`npm run discovery:check`) warns about server-rendered pages without a twin; that is expected for forms.

## Verify

```bash
npm run build && npm run build:headers:prod
npm run discovery:check
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
