# Toolkit map (generated: `node Web_Toolkit/toolkit_index/bin/toolkit-index.mjs build`)

Find a tool: `toolkit-index find "<what you want to do>"`. Any tool: `<tool> --help` (Usage, Flags, Examples, Exit codes).
Rules that apply everywhere: read the site profile first; mutations are dry-run until `--apply`; run `site-readiness` before material work.

## I want to...

- build a new site, install layout header footer analytics consent contact form styles fonts templates -> **site-templates** (show <name> for one template; add layout analytics contact styles fonts --apply (contact-intake only for long forms); then site-theme apply)
- port already in use, EADDRINUSE, pick a free port, stop the preview server I started, who is using this port, dev server running -> **dev-ports** (free --preferred <n> before starting a server; release --port <n> stops only toolkit-owned servers; never stop a foreign process without asking the user)
- make the site accessible, WCAG, contrast, keyboard focus, screen reader gate -> **wcag-auditor** (preview-check contrast for a quick standalone check)
- compare themes, try other looks, reuse a site's design, re-theme -> **site-theme** (compare --all, extract, apply)
- contact form, inquiry form, form silently loses leads, form says sent but no email arrives, spam honeypot, no-JS form, retry and mailto fallback -> **form-doctor** (scan (read-only), then run --spawn after a build to probe a local Worker with a broken mail binding)
- on-page SEO, titles, meta descriptions, canonical, broken links -> **preview-check** (seo --sitemap)
- sitemap, robots.txt, llms.txt, JSON-LD, markdown twins, agent readiness -> **discovery-doctor**
- performance, Lighthouse, Core Web Vitals, PageSpeed -> **pagespeed-diagnostics** (preview-check lighthouse for local previews)
- horizontal overflow, responsive layout, reduced motion -> **preview-check** (layout, motion)
- upgrade dependencies, Astro major, typescript held back, versions -> **package-updater** (run --apply verifies and rolls back; doctor lints starters)
- convert npm to pnpm, package manager migration -> **package-updater** (migrate)
- deploy, DNS, cache purge, zone hardening, Cloudflare account -> **cf-agent** (dry-run first; context shows which account)
- _headers, security headers, cache baseline -> **headers-deploy**
- favicon, Open Graph images, brand assets -> **brand-doctor**
- convert images to WebP/AVIF, optimize rasters -> **image-pipeline**
- screenshots of pages for galleries or visual regression -> **site-snapshots**
- new site, scaffold, first setup, readiness -> **site-readiness** (project-init apply-safe on an empty folder; site-starter skill)
- is this machine ready, tools missing, Node, Playwright -> **site-doctor**
- check CSS for tokens, hardcoded colors, reduced-motion guard -> **stylesheet-check**
- before sharing the toolkit, privacy scan, secrets -> **privacy-check** (toolkit-purge, toolkit-verify)

## Start a site

- **project-init** [audit, apply-safe]: Non-destructive project bootstrap and hole-finding
  `project-init audit --project-root C:/sites/new-client`
- **init-site-profile** [requirements, create]: Create portable site profiles in the client project (agent intake helper)
  `init-site-profile requirements`
- **site-readiness**: Run-all data collection with next-step report (sandbox-aware)
  `site-readiness run --project-root .`
- **agent-env-setup** [doctor, verify, fix, prepare-host]: Portable host environment setup for Codex / Antigravity
  `agent-env-setup doctor --workspace C:/sites/client-app`
- **astro-env-setup** [doctor, fix, verify, prepare-project, preview, preview-smoke]: Portable Astro/Vite/Cloudflare environment setup
  `astro-env-setup doctor --project-root C:/sites/client-app --site-profile ../../site-profiles/client.json`

## Build and style

- **site-templates** [list, show, add]: Install copy-ready site templates (layout, analytics, contact, contact-intake, theme, styles, fonts) into a project with their prerequisites, CSS i...
  `site-templates list`
- **site-theme** [list, validate, apply, export, map, extract]: Token-based themes for Astro sites: install bundled themes, extract a draft theme from a built site, compare several themes on the same site.
  `site-theme list`
- **stylesheet-check**: Audit external CSS architecture, token placement, and file size limits
  `stylesheet-check scan --root .`
- **image-pipeline** [audit, optimize]: Raster image audit and lossless WebP conversion helper
  `image-pipeline audit --project-root C:/sites/client-app`
- **brand-doctor** [setup-env, audit, sync-tokens, generate-og, generate-icons, og-pages]: Branding/meta audit and asset generation helper
  `brand-doctor audit --project-root C:/sites/client-app`
- **vectorize-pipeline** [from-font, vectorize]: Clean SVG wordmarks: prefer from-font for crisp type; vectorize for high-contrast rasters
  `vectorize-pipeline from-font --title "Example Studio" --subtitle WORKS --serif ./ExampleSerif.ttf --sans ./ExampleSans.ttf --fill "#f4fff...`

## Check quality

- **wcag-auditor** [run, init, report, doctor, validate-config, list-rules]: Accessibility evidence gate: site-profile wrapper around WCAGate
  `wcag-auditor init --site-profile ../site-profiles/example-workers.json`
- **preview-check** [lighthouse, layout, contrast, seo, motion]: Pre-deploy checks (Lighthouse, responsive overflow, motion policy) against a local preview or any URL
  `preview-check lighthouse --url http://127.0.0.1:8791 --routes /,/about/ --min 100`
- **site-snapshots** [capture, check]: Capture and verify up-to-date screenshots of live pages for portfolio and showcase sections
  `site-snapshots capture --project-root . --apply`
- **browser-diagnostics**: Live browser diagnostics via Playwright with optional Lighthouse
  `browser-diagnostics run --site-profile ../site-profiles/example-workers.json`
- **pagespeed-diagnostics** [run, raw-psi, agent-batch, agent-diff]: Google PageSpeed Insights API diagnostics
  `pagespeed-diagnostics run --site-profile ../site-profiles/example-workers.json`
- **site-doctor** [run, diff]: Unified portable site diagnostics
  `site-doctor run --site-profile ../site-profiles/example-workers.json`
- **site-quality-smoke** [run, diff]: SEO/performance/header smoke tests plus legal, cookies, image-format, and font checks
  `site-quality-smoke run --site-profile ../site-profiles/example-workers.json`
- **performance-fixes** [recommend, immutable-cache]: Source-level performance remediation helpers
  `performance-fixes recommend --site-profile ../site-profiles/example-workers.json`
- **form-doctor** [scan, probe, run]: Check that contact and intake forms report failures honestly (static scan plus local runtime probe)
  `form-doctor scan --project-root .`

## Discovery and SEO

- **discovery-doctor**: Audit discovery files, APIs, and AI-readable endpoints
  `discovery-doctor ./dist --json`
- **sourcing-doctor** [audit, extract, help]: Import/audit legacy CMS content sources
  `sourcing-doctor audit --site-profile ./site.site-profile.json`

## Cloudflare and deploy

- **cf-agent** [init, context, doctor, wrangler, auth, permissions]: Portable Cloudflare automation assistant
  `cf-agent doctor --json --offline`
- **headers-deploy** [scaffold-public, write-deploy, audit, stack]: Cloudflare `_headers` cache baseline, deploy security merge, and audits
  `headers-deploy stack`
- **cache-purge**: Targeted Astro/Cloudflare cache purge helper
  `cache-purge --site-profile ../site-profiles/example-workers.json`
- **integration-doctor**: Env/live integration diagnostics
  `integration-doctor run --site-profile ../site-profiles/example-workers.json`

## Keep current

- **package-updater** [run, migrate, refresh-starters, doctor]: Peer-aware toolchain updates: newest compatible dependency ranges, Astro via its official upgrader, verified or rolled back.
  `package-updater run --project-root .`
- **toolkit-report**: Generate a quick project/toolkit readiness report
  `toolkit-report generate --project-root C:/sites/client-app`
- **toolkit-verify**: Portable toolkit self-verification helper
  `toolkit-verify`
- **toolkit-purge**: Clean deletable portable-toolkit runtime artifacts
  `toolkit-purge`
- **privacy-check**: Scan for secrets and site-specific leftovers
  `privacy-check scan --root C:/portable-toolkit-export`
- **junk-purge**: Safe transient-file cleanup utility for Astro/Vite/Cloudflare project roots
  `junk-purge --project-root C:/sites/client-app`
- **toolkit-index** [find, build, check]: The toolkit map for AI models: find the right tool for a task, and keep docs/TOOLS.md generated from the tools' own help.
  `toolkit-index find "compare five themes on this site"`

## Content sources

- **instagram-clone** [clone, audit]: Clone public Instagram feeds for static/portfolio sites
  `instagram-clone clone --project-root . --username example --json`

## Other

- **dev-ports**: Pick a free local port, see who holds a port, and stop only the servers the toolkit started. Never assume 4321 is free: it is often the user's own...

## Templates (copy-ready, theme-token based; see each README)

- `Web_Toolkit/templates/base`: tsconfig, env types, pnpm settings (site-templates add base)
- `Web_Toolkit/templates/theme`: token contract, 5 themes, ThemeInit/Toggle/Picker
- `Web_Toolkit/templates/styles`: component CSS on theme tokens (button, card, hero, form, prose, utilities)
- `Web_Toolkit/templates/fonts`: self-hosted fonts: sync-fonts, @font-face with fallback metrics, preload
- `Web_Toolkit/templates/layout`: BaseHead, BaseLayout, header/nav/footer, breadcrumbs, skip link
- `Web_Toolkit/templates/analytics`: consent banner, GA4/PostHog/CF Web Analytics loaders gated by consent
- `Web_Toolkit/templates/contact`: contact form with Turnstile and a Workers send_email handler
- `Web_Toolkit/templates/discovery`: sitemap, llms.txt, robots, JSON-LD, markdown twins, API catalog
- `Web_Toolkit/templates/cinematic`: motion and page-system CSS, WebGL hero field
