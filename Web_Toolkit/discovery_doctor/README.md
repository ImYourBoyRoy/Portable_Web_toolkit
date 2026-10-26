# Discovery Doctor

Audit a built Astro/Cloudflare `dist/` tree or a live public site for
standards-shaped discovery resources, public content endpoints, JSON-LD, and
the deployed header baseline.

The doctor is fail-closed for the toolkit's default discovery contract:
`robots.txt`, sitemap, `llms.txt`, `llms-full.txt`, `humans.txt`,
`security.txt`, the structured content API, security headers, and the homepage
JSON-LD baseline. A site profile may explicitly relax a requirement or add
custom REST/MCP endpoints. Relaxed or runtime-only resources are reported as
INFO when absent, while any resource that exists but is malformed is a failure.

## Usage

```bash
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist/client
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs https://example.com
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs https://example.com --site-profile ./site.site-profile.json
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist --policy ./discovery-policy.json
```

Useful flags:

```text
--strict              Treat warnings as exit-code failures.
--environment development
                      Require preview robots to use Disallow: / and do not
                      require a sitemap or security.txt unless the policy
                      explicitly does so.
--require-llms        Force /llms.txt to be required for this run.
--require-llms-full   Force /llms-full.txt to be required for this run.
--skip-link-checks    Do not fetch same-origin links advertised by llms.txt.
--site-profile PATH   Read profile.diagnostics.discovery (or profile.discovery).
--policy PATH         Read a standalone discovery policy JSON object.
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | No failures (warnings allowed unless `--strict`) |
| 1 | Usage / missing target |
| 2 | One or more check failures |

## What is validated

| Artifact | Validation |
|---|---|
| Sitemap | Real bounded XML parse; exact sitemap namespace; `urlset`/`sitemapindex`; absolute HTTP(S) `loc`; one `loc` per entry; 50,000-entry limit. |
| `robots.txt` | `Sitemap:` URLs are absolute and valid; production must not block the whole site; development must block the whole site. |
| `llms.txt` | H1-first Markdown; recommended blockquote summary; H2 link-list sections; valid HTTP(S)/relative links; no private-looking paths, sensitive query values, or credentials. |
| `llms-full.txt` | Same link and secret safety checks, with full-context prose allowed in H2 sections. |
| `security.txt` | RFC 9116-style `Contact`, exactly one future RFC 3339 `Expires`, and URI validation for `Policy`/`Canonical`. |
| JSON | Valid JSON, with optional `object`, `array`, or `{ ok: true, data, meta?, warnings? }` envelope policy. |
| JSON-LD | Parse every `application/ld+json` block; malformed blocks fail; `WebSite`, `Organization`, or `Person` is required by the default toolkit baseline. |
| Content type | Live JSON, XML, text, and HTML endpoints are checked against their declared media types when the server sends `Content-Type`. Missing type is a warning, not an invented failure. |
| MCP | Live public POST only; modern 2026-07-28 `server/discover` + list checks with fallback to legacy initialize/tools/list. No tools are called and no credentials are sent. |
| `_headers` | Existing Portable Web Toolkit security-header baseline under `dist/` or `dist/client/`. |

Google PageSpeed Insights/Lighthouse is a performance and page-quality tool,
not an `llms.txt` conformance authority. Discovery Doctor validates the
published discovery contract separately while preserving normal crawlable HTML
and Core Web Vitals checks.

## Policy configuration

Put site-specific expectations in the site profile rather than hardcoding a
client into the toolkit:

```json
{
  "diagnostics": {
    "discovery": {
      "required": {
        "robots": true,
        "sitemap": true,
        "llms": true,
        "llmsFull": true,
        "humans": true,
        "securityTxt": true,
        "contentApi": true,
        "searchApi": false
      },
      "endpoints": [
        {
          "path": "/api/v1/catalog.json",
          "label": "Public Catalog API",
          "format": "json",
          "required": true,
          "schema": "object"
        },
        {
          "path": "/api/v1/mcp",
          "label": "Public MCP",
          "method": "POST",
          "format": "mcp",
          "required": true,
          "runtimeOnly": true
        }
      ],
      "mcpProtocolVersion": "2026-07-28",
      "maxLinks": 40,
      "timeoutMs": 10000
    }
  }
}
```

In production, the default policy requires the toolkit’s `robots.txt`, sitemap, `llms.txt`,
`llms-full.txt`, `humans.txt`, `security.txt`, structured content API,
security headers, and homepage JSON-LD baseline. The runtime-only search API
is optional by default. Development/preview mode keeps the generated
`humans.txt` contract but does not require `security.txt` or a sitemap unless
the policy explicitly enables them, matching the environment-aware templates.
A profile can explicitly set any requirement to `false` or `true`, and custom
`endpoints` replace the generic `/api/content.json` and `/api/search.json`
examples.

For a local static build, an endpoint marked `runtimeOnly` is INFO when absent:
the build cannot prove a Worker/SSR route. Run the same policy against the
live URL to validate it. A live endpoint that returns a successful response
with invalid content fails even when the endpoint itself is optional.

## MCP probe behavior

The live probe is intentionally read-only:

1. Try modern MCP `2026-07-28` `server/discover`.
2. Validate the advertised version and list methods (`tools/list`, plus
   `resources/list`/`prompts/list` when those capabilities are advertised).
3. Fall back only when `server/discover` is clearly unavailable, then use the
   legacy `2025-11-25` initialize/initialized exchange.
4. Never call a tool, read a private resource, send cookies, or attach an
   authorization header.

This makes the check suitable for public discovery endpoints. It is not an
OAuth authorization test and cannot prove that a user-scoped endpoint protects
private data; that requires a separate authenticated integration test.

## Cross-platform and tests

The CLI uses `node:path` and emits platform-neutral operator output.

```bash
npm test --prefix ./Web_Toolkit/discovery_doctor
```

Run local discovery after the project build and run the live form after a
staging/production deployment. Do not treat a local build result as proof of a
Cloudflare Worker route, OAuth behavior, or live MCP behavior.
