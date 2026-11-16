# MCP servers and plugins: what each is for

The toolkit is deterministic CLIs plus skills. MCP servers and plugins add live tools to an agent. They overlap in places;
this is the division of labor.

## Cloudflare: API (cf-agent) vs plugin/connector

You want both, and they do different jobs.

| | **cf-agent (API token per project)** | **Cloudflare plugin / MCP connector** |
|---|---|---|
| Identity | The token in the **project `.env`**. Any number of accounts and projects, switched by changing directory or `--site-profile`. | **One account at a time** (whatever the connector is authorized as). |
| Best for | Everything that changes something: deploys, DNS, cache purge, hardening, token permission audits. Dry-run -> review -> `--apply`, profile-driven, scriptable, CI-safe. | Documentation and platform guidance (skills), exploring bindings/observability for the account it is signed into, one-off questions. |
| Safety model | Explicit zone/account from the site profile; dry-run first. | Implicit account; no profile guard. |

**Rules**

1. **Mutations go through cf-agent with a site profile.** Use the plugin read-only (docs, logs, "what does this binding do").
2. **Before using the plugin on a specific site, run `cf-agent context --site-profile <profile>`.** It prints the account,
   zone, and token that site resolves to (ids and names, no secrets) and warns when the profile/.env account differs from
   the zone's account. Compare that account with the one the plugin is signed into; if they differ, do not use the plugin on this site.
3. Multi-project work (several sites, several accounts) is cf-agent's job; the plugin cannot do it.
4. Never paste the API token into the plugin or an MCP config; the token stays in the project `.env`.

## Accessibility

**WCAGate / `wcag-auditor`** is the accessibility tool: local, deterministic, fail-closed, CI-ready, with a grouped token-lean
report. Remote accessibility services (for example Deque's Axe MCP, which runs in Deque's cloud so page content leaves the
machine) are **declined by policy**: client previews and unreleased work stay local. Revisit only if a tool of that kind
runs fully locally.

## Browser tools: keep the built-in browser

Decision: **keep the built-in browser** (the in-app browser pane) for agent work: you can see it, take over, and keep
sign-ins; it covers navigation, accessibility-tree reads, screenshots, console/network, viewport emulation, and JS inspection.
Playwright MCP is not added: it mainly buys Firefox/WebKit, traces/video, and use from agents without a built-in browser.
Playwright itself is already a dependency of WCAGate, `preview-check`, `site-snapshots`, and `site-theme`, and cross-browser
checks use `browser: 'firefox'|'webkit'` in the WCAGate config.

## Svelte MCP (Svelte and Tauri apps)

For `.svelte` work (your Tauri/Svelte apps, not Astro sites): use `get-documentation`/`list-sections` before writing runes
code and run `svelte-autofixer` on every component you change until it reports no issues. WCAGate's `svelte` adapter then
reports the compiler `a11y_*` diagnostics; fix those the same way (autofixer first, then re-run the gate).

## SEO and marketing

`preview-check seo` covers the deterministic on-page checks (title/description length and duplicates, canonical, noindex,
lang, h1, Open Graph/Twitter, JSON-LD parse, image sizing, broken/redirecting internal links) with one line per cause.
`discovery-doctor` covers sitemap, robots, llms.txt, headers, and structured-data surfaces.

Keyword research, content strategy, and ranking advice are a **marketing** concern with different inputs (Search Console,
analytics, competitors) and a different cadence. They do not belong in this build toolkit. The plan is a separate package in
the WCAGate mold (engine in its own repo, thin bridge here, installed as a semver range) when it is wanted; until then use
Search Console directly or a community SEO plugin, and treat the output as suggestions.
