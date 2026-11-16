# Changelog

All notable changes to Portable Web Toolkit are documented here.  
Version tags match root `VERSION` and `Web_Toolkit/package.json`.

## [0.6.1] - 2026-11-16

### Added (forms reliability)

- **`form-doctor`** (new tool, `Web_Toolkit/form_doctor/`): a static scan and a local runtime probe for contact and intake forms, built from a real incident where a site swallowed a failed `send_email`, logged the visitor's payload and still answered 200, so "Inquiry sent" appeared and the lead was lost. Scan rules: `form-no-method` (no-JS submit becomes GET and puts answers in the URL), `swallowed-send-error`, `no-error-status`, `logs-payload`, `returns-error-message`, `no-body-cap`, `no-allowlist`, `unescaped-html-email`, `client-ignores-status`, plus warnings for origin check, rate limit and spam control; thin routes are judged with the files they import; unreadable or unparsable surfaces fail closed (`malformed-surface`) and a project with no form is INFO. Probe (`--spawn`, loopback only): starts `wrangler dev` on a temporary copy of the built config with the mail binding removed (expect 503) and with the destination rejected (expect 502), then checks GET carries no data, a 1.5 MB body is 413, an unknown field is 400/422, a foreign Origin is 403, and no answer leaks internals. Why not `integration-doctor`: that one reads env and live-integration posture; this one reads form source and drives a local Worker. Registered in `package.json`, `toolkit-index` (`docs/TOOLS.md`), shared boolean flags (`spawn`, `expect-mail-failure`); 17 scan and 7 probe tests. Run read-only across eight sibling sites; findings in each site's `tasklist/forms-reliability.md`.
- **`templates/contact` upgrade**: verified the route never swallowed a send error (502/503 were already honest), and added a streamed body cap (Content-Length alone could be bypassed), a time-to-submit trap (`form_elapsed`, `minFillMs`), a submission id (subject, text, HTML, logs, duplicate suppression), `turnstile.mode: "off"` and Turnstile loading on first focus only, a draft store (`scripts/form-draft.ts`: versioned key, 7 day expiry, excluded fields, cleared only after a confirmed success, "Clear saved draft"), Retry plus a prefilled `mailto:` on failure, and README copy-map updates. New `lib/intake-lib.ts` (strict per-field allowlist, honeypot, time trap, bounded body reader, escaped email rendering) and `lib/handle-intake.ts` (the whole pipeline as a function with injected bindings) with `examples/` for a multi-section form; both extracted from imyourboyroy.com `/inquire/`. 50 template tests (39 contact-lib, 7 intake handler, 4 draft).

### Added (ports and ownership, pnpm everywhere)

- **`dev-ports`** (new tool) and `shared/lib/dev-server.mjs`: never assume a port is free (4321 is often the user's own dev server). `free --preferred <n>` picks a free port (IPv4 and IPv6 loopback checked) and says when the preferred one was busy; `who --port <n>` shows the listener's pid, command and directory and whether the toolkit started it; `release --port <n>` stops only servers the toolkit started; `cleanup` stops owned servers whose run crashed. Servers the toolkit starts are registered in `.runtime/owned-processes.json` with a start-time token, so a recycled pid is never mistaken for ours. A foreign process is never touched unless the user said yes in chat and the exact pid is passed as `--approved-pid`; otherwise the result carries who owns the port so the model can ask. `form-doctor --spawn`, `preview-smoke` (which used to kill only the shell and leave the server running) and `wcag-auditor --manage-server` now start an owned server on a free port and stop its whole process group. Rule added to `AGENTS.md`, the `wcag-auditor` skill and `docs/TOOLS.md`.
- **WCAGate 2.4 `webServer.autoPort`** (default in every `init` preset): the managed preview runs on a free port WCAGate owns, never adopting whatever already answers on the preset port; an explicit `--base-url` still means "use my server". Found when an audit started against port 4321, which was a different project's dev server.
- **pnpm for the toolkit and WCAGate themselves**: repository scripts, CI (`pnpm install --frozen-lockfile`, `pnpm audit`), the Vectorize Pipeline lock, and the WCAGate engine install (pnpm when installed, npm as a fallback) use pnpm; WCAGate's own repository is pnpm with auto-installed peers, so its real-browser tests now run in CI instead of skipping. `docs/PACKAGE_MANAGERS.md` explains the remaining fallback.
- `npm test` now runs the template tests (about 230 of them were not part of CI).

### Changed (pre-release audit: Windows, macOS and process safety)

- **Cross-platform spawning**: `shared/lib/spawn-cross.mjs` runs `pnpm`, `npm`, `npx`, `yarn`, `wrangler` and any `.cmd`/`.bat` through `cmd.exe /d /s /c` with a verbatim, correctly quoted line on Windows (Node refuses to spawn a `.cmd` directly, and `shell: true` turned `semver:>=2` into a redirect), and spawns everything else directly. Used by the package-manager helper (`isInstalled` returned false for pnpm on Windows, so the engine silently installed with npm), the engine install and auto-update, and the managed-server paths; `form-doctor --spawn` runs wrangler's own JS entry with this Node because the `.bin/wrangler` shim is a shell script on Windows; `preview-smoke` uses `sh -c`, not a login shell, and a verbatim cmd line on Windows.
- **Ports on macOS and Windows**: a bind test alone calls a port free while another process listens on `0.0.0.0` or `[::]`, so a free port must also refuse connections on IPv4 and IPv6 loopback. Windows listener lookup reads IPv4 and IPv6 rows and no longer depends on the localized "LISTENING" word.
- **Process safety (found by an adversarial review)**: pids 0 and 1 (and anything that is not an integer above 1) are never signalled, since `kill(-1)` reaches every process the user owns; an approved foreign pid is signalled alone, never its group or tree; a server the toolkit started is stopped from its own handle even if the registry entry was lost; Ctrl+C, SIGTERM and SIGHUP stop owned servers; descendants that outlive a wrapper (`sh`, `pnpm`) are stopped with it; a registry entry with no readable start token is trusted only while the run that started it is alive (Windows now reads the start time); ownership covers a listener that is a descendant of an owned server; the registry is validated, serialised with a lock, written with retry, and a corrupt file is set aside; an answer from a process that is not the one the toolkit started is refused instead of audited.
- **Line endings**: `.gitattributes` (LF for text, bytes untouched for `.bat`/`.cmd` and binaries) in both repositories, because Git for Windows defaults to autocrlf and would turn `SKILL.md` into CRLF and `.sh`/`.command` into scripts macOS cannot run; skill content digests hash text files with LF endings so a CRLF copy verifies; `site-templates` treats a CRLF copy of a template file as identical and keeps a CSS file's line endings.
- **CI**: validation now runs on Linux and macOS (blocking) and Windows (reported, not blocking until its first green run); the tests that use POSIX path literals are the known gap for Windows.
- Docs: three relative links that pointed outside the repository, and a stale pinned Node version in the setup README.

### Changed (final end-to-end pass)

- **Plan output and discovery.** `site-templates add` prints one line per template (folders and counts; `--verbose` lists files) and each shared follow-up once; `site-templates show <name> [--section <words>]` prints a template's contract (~150 tokens) or one README section instead of the whole README; new `site-templates` skill routes models to it.
- **`contact-intake`** is a separate template (only `handle-intake.ts`); `intake-lib.ts` stays in `contact` because the route imports its body helpers.
- **Contact route is a strict allowlist**: a body field the form does not send (or `contact.json` `extraFields` does not declare) gets 422, matching `form-doctor` and the intake handler. Found by running `form-doctor run --spawn` against a site built from the templates: it failed `unexpected-field`.
- **`form-doctor` fixes found the same way**: a `<form>` quoted in an Astro frontmatter doc comment was scanned as markup (false `form-no-action`), and a form that lives in a component (the contact template) had no probe target; the page that renders the component is now found.
- **Snippet and starter fixes**: `wrangler.contact.snippet.toml` no longer has a second `[vars]` table (a TOML error when appended) and no longer sets `remote = true` (it made every `astro build` need a Cloudflare login); `fonts` installs an empty `fonts.manifest.json` stub so `astro check` passes before the first `sync-fonts`; layout next-steps explain `prerender`, `PUBLIC_SECURITY_CONTACT` and `build:headers:prod`, the three things discovery-doctor failed on.
- Send call checked against current Cloudflare Email Service docs (object form: `to`, `from: { email, name }`, `replyTo`, `subject`, `text`, `html`; failures throw).
- `HOW_TO.md` is a human guide; agent-facing docs point only at its two maintenance sections.

### Added (templates)

- **`site-templates`** installs any `templates/<name>/template.json` into a site (`list`, `add <names> [--apply] [--force]`): files to the right destinations, prerequisites first (`theme`, `base`, `discovery`), CSS `@import`s inserted in valid order, edited files and data examples never overwritten, destinations confined to the project, next steps printed. Replaces the hand-copied "copy map" tables.
- **Six templates** from the site survey: `layout` (BaseHead with SEO/OG/canonical/robots model, BaseLayout, header with accessible mobile menu, footer, breadcrumbs, skip link), `analytics` (consent banner, default off, GA4/PostHog/Cloudflare Web Analytics after consent), `contact` (accessible form, Turnstile, Workers `send_email` endpoint), `styles` (button, card, hero, section, form controls, prose on theme tokens), `fonts` (`sync-fonts` reads real woff2 metrics for fallback faces; FontPreload), plus `base` (tsconfig that keeps `@cloudflare/workers-types` out of the DOM lib, env types, pnpm settings). Unit-tested pure logic in erasable TypeScript, token-conformance tests on all CSS.
- Contract additions: `--color-danger`, `--color-success`, `--color-border-strong` (3:1 control edges, WCAG 1.4.11), validated in all five themes and derived by `extract`.
- Verified end to end on a real Astro build assembled only with these commands: `astro check` 0 errors, WCAGate gate passed (3 routes x light/dark x mobile/desktop, all probes), `preview-check seo` clean, `stylesheet-check` clean, zero low-contrast text in all five themes.
- Findings from that build, fixed: example nav/footer linked pages a fresh site lacks (now Home/About/Contact only), `stylesheet-check` flagged theme variants as duplicate tokens and did not recognise the template layout, `compare` mis-reported "site ignores tokens" for the active theme, `FontPreload` had a type error, and `@cloudflare/workers-types` in tsconfig broke ordinary client DOM code.
- **Release-age aware updates**: pnpm 12 refuses releases younger than 24 h (`minimumReleaseAge`), so the updater never writes a range that needs one (policy `minimumReleaseAgeHours`, or the project's `pnpm-workspace.yaml`), and says when the hold lifts. Starters were pulled back from versions published that day. WCAGate (2.4) now installs its Playwright/axe peers with the project's package manager.

### Added (AI ergonomics, migration, theme export)

- **`docs/TOOLS.md` + `toolkit-index`**: one generated page (32 tools in ~2.1k tokens, grouped by what you are trying to do, with a task -> tool table and the template list) built from every CLI's own structured help (`PORTABLE_TOOLKIT_HELP_JSON=1`), so it cannot drift; `toolkit-index find "<task>"` ranks tools for a sentence; a test fails when the index is stale. START_HERE, AGENTS, and the router skill point at it first.
- **`package-updater migrate`**: in-place npm/yarn/bun -> pnpm conversion (import, `pnpm-workspace.yaml`, script rewrite, install + verify, full restore on failure, `--allow-builds` / `--deny-builds` decisions, a list of CI/docs lines still saying npm). Verified on a real site's manifest. `site-readiness` points non-pnpm sites at it. Remaining client-facing call sites (Setup_astro, Pages deploy, browser-diagnostics, readiness build) use the shared helper; the toolkit's own engine install uses pnpm too, with npm only as a fallback when pnpm is absent (`docs/PACKAGE_MANAGERS.md`).
- **Hold explanations for models and users**: for every held package the updater reports the blocker, what the blocker's newest release declares, when the hold lifts, and the options (wait, accept the risk via `acceptPeerConflicts` with a required reason, replace the laggard); `run --json` emits one JSON plan. Accepted risks are printed in every report.
- **site-theme export / map / library**: `export` puts a theme in `~/.portable-web-toolkit/themes` (or `PORTABLE_TOOLKIT_THEMES`) under any name; `map init` writes `theme-map.json` linking a site's own variable names to the contract (matched by resolved value, then name); `apply` turns it into `compat.css`. Verified by applying an extracted Nomos theme to ReadyForUs.
- `docs/agent-skills/INTEGRATION_POLICY.md`: build / adopt / replace rules and a decision table (remote a11y declined, built-in browser kept, marketing deferred to a future package).

### Added (toolchain, pnpm, themes, SEO)

- **Peer-aware toolchain updates, no manual cap table.** `package-updater` resolves the newest dependency set whose `peerDependencies` agree (plus the Astro anchor's own bundler range) from the live registry. TypeScript stays on 6.x because `@astrojs/check` peers `^5 || ^6`, with the reason printed, and lifts itself the first run after a release allows 7. If an integration has no release for a new Astro major, Astro holds on the previous major and names the laggard. Ranges are never exact (`^` default, `~` kept, `>=` kept and bounded below a held-back major). `run --apply` runs the official `@astrojs/upgrade`, writes ranges, installs, verifies `check` + `build`, and **restores package.json and the lockfile on failure**. New `refresh-starters` (resolve the toolkit's own starters) and `doctor` (no exact pins, valid ranges, engine floors). Policy: `package_updater/policy.json` (anchors, documented holds that require a reason, ignore) plus an optional project `toolchain.policy.json`. Zero-dependency `shared/lib/semver-lite.mjs` (also used by `engine-spec`). `.github/workflows/toolchain-refresh.yml` opens a weekly PR with the refreshed starters.
- **pnpm is the default package manager** (`shared/lib/package-manager.mjs`): explicit flag/`PORTABLE_TOOLKIT_PM`, then the project lockfile (npm/yarn/bun sites are respected), then `packageManager` name (never its version), then pnpm if installed. Used by package-updater, wcag-auditor Playwright prep, cf-agent's wrangler calls, and preview-check Lighthouse. Starter scripts are pnpm-first, upgrade scripts call package-updater, and `site-starter/pnpm-workspace.yaml` carries pnpm 12's `allowBuilds` and `overrides` (pnpm 12 ignores the package.json `pnpm` field and fails installs on unlisted build scripts, verified on the starter). `site-readiness` reports the detected package manager, exact pins, and a missing `pnpm-workspace.yaml`. Measured on two real sites: npm 1.4 GB vs pnpm 0.79 GB total.
- **site-theme** (new tool, skill `site-theme`, templates `templates/theme/`): a token contract, five AA-validated starter themes (paper, ink, studio, glass-night, contrast), `ThemeInit`/`ThemeToggle`/`ThemePicker` Astro components, and `site-theme list | validate | apply | extract | compare`. `extract` measures a built site into a draft theme with provenance per token and repairs contrast-critical pairs; `compare` injects each theme into the live page, screenshots every route, counts low-contrast text, and writes a contact sheet (verified on a real site: the dark themes exposed 22 text nodes that ignore the tokens).
- **preview-check seo**: deterministic on-page audit of rendered pages (title/description length and duplicates, canonical host/slash, noindex, lang, h1, Open Graph/Twitter, JSON-LD parse, image sizing, broken and redirecting internal links), routes from `--sitemap`, one line per cause. Shared `shared/lib/sitemap.mjs`.
- **cf-agent context**: prints the Cloudflare account, zone, and token a site resolves to (no secrets) and warns on account mismatch, so the per-project API and a one-account-at-a-time Cloudflare plugin are never confused.
- `docs/agent-skills/MCP_INTEGRATIONS.md`: Cloudflare API vs plugin, remote a11y services declined (Axe MCP runs in Deque's cloud), built-in browser kept over Playwright MCP, Svelte MCP, SEO scope (keyword/content strategy is a future separate marketing package). Router and skills updated; template roadmap from a survey of nine sites in `templates/theme/README.md`.

### Added

- **wcag-auditor wrapper coverage flags** (need WCAGate 2.4+; an older engine is refused with an upgrade hint instead of silently ignoring the flag): `--routes`, `--sitemap[=<url|file>]`, `--max-routes`, `--color-schemes`, `--viewports`, `--baseline [file]`, `--write-baseline [file]`. Profile-built runs read the same options from `diagnostics.wcagAuditor` (`sitemap`, `sitemapUrl`, `maxRoutes`, `matrix`, `baseline`, `unresolvedEvidence`), declared in `site-profile.schema.json`. New `src/toolkit/overlays.mjs` maps them onto the engine API with feature detection and has stub-engine tests (`wcag_auditor/tests/overlays.test.mjs`).
- **Profile-built and starter configs** enable the `reflow` (WCAG 1.4.10) and `textSpacing` (1.4.12) probes on AA/AAA targets and pass `matrix` through when the engine supports it. `diagnostics.wcagAuditor.unresolvedEvidence: "error"` makes a profile-built run fail closed on unresolved evidence (the long-standing default stays `ignore`).

### Added (agent-friendly output)

- **Grouped, token-lean report** (needs the WCAGate agent report): profile-built runs add the `agent` reporter (`agent.md`) and the console prints findings grouped by root cause with each fix once (a real run: 137,792 tokens of JSON became 1,182). New `wcag-auditor report [--group gN] [--json] [--file <run.json>]` re-prints the newest run or drills into one cause; `--verbose` restores the per-finding console; `--no-compare` skips the since-last-run comparison. Because every profile run writes to its own timestamped `output/wcag-auditor-<site>-<stamp>/` folder, the wrapper now finds the previous run itself (`src/toolkit/latest-run.mjs`) so `since last run` and `NEW` markers work. Older engines are refused for `report` with an upgrade hint, and never receive the unknown `agent` reporter.

### Changed (engine versioning)

- **No pinned WCAGate version anywhere.** `Web_Toolkit/package.json` asks for `github:imyourboyroy/WCAGate#semver:*` (the latest published release tag); `shared/lib/engine-spec.mjs` is the single definition (range, repository, tag parsing) and a test keeps `package.json` equal to it. The freshness check now lists release tags (`git ls-remote --tags`) and installs when a newer release satisfies the range, instead of tracking the `main` head, so unreleased WCAGate commits never reach a site and a tagged release always does. `npm run wcagate:update` runs the same check immediately. To stay on a major, change the range in both places (for example `^2`). A WCAGate change reaches the toolkit once it is tagged.

### Fixed

- **wcag-auditor** forwarded only `--config/--cwd/--quiet/--no-color` to the engine when no site profile was given, so `--base-url` was silently dropped on that path. It now forwards `--base-url`, `--routes`, and the new coverage flags.

### Changed

- WCAGate 2.4 resolves axe `color-contrast` incompletes from rendered pixels (gradient, image, and glass backgrounds now pass or fail instead of staying `cantTell`), which supersedes the `preview-check contrast` workaround for the common case; that command stays as the quick standalone check and the one that can click into a state first.

## [0.5.1] - 2026-11-15

### Fixed

- **CI** installs the WCAGate engine (`npm install --prefix Web_Toolkit`) before `npm run validate`. The wcag-auditor wrapper tests had only passed because the auto-update preflight installed it as a side effect, which stopped once `--help` and `--apply` invocations skipped the preflight.
- **site-starter `OptimizedPicture.astro`** used shell-style `#` comments inside its frontmatter, so `astro check` reported 53 errors in every new project. They are `//` comments now.

## [0.5.0] - 2026-11-15

### Added

- **wcag-auditor `--base-url` for config runs**: `--project-root --config` runs now apply `--base-url` to every adapter and print how many were changed. A checked-in config usually points at production, so the flag was silently ignored and local previews were never audited.
- **Discovery template page-lastmod baseline**: `refresh-page-lastmod.mjs` reads an optional `src/data/page-lastmod-baseline.json` (`{ "commit", "pages" }`) so a repo whose first commit is only an import checkpoint keeps real page dates until a page is edited. Covered by `tests/discovery-template.test.mjs`.
- **templates/cinematic gotchas**: large CSS-image artwork becomes the LCP element as `background-image` and as `mask-image`; never scale an LCP-candidate image during load-in; phone layouts need scroll-snap rails and 2x2 grids; wrapped chip lists and dimmed text fail on phones and in `preview-check contrast`.
- **discovery-doctor agent-readiness checks** (additive; absent surfaces report INFO, so existing sites keep their exit codes): `API catalog (RFC 9727)` (linkset shape, descriptions, `application/linkset+json`), `Markdown twins` (`<page>/index.md` per sitemap page, no raw HTML, canonical mention) with live `Accept: text/markdown` negotiation and `Vary: Accept`, `Link headers (RFC 8288)` (`rel=api-catalog`, markdown alternate; local `_headers` rules or live responses), `MCP server card` (`/.well-known/mcp/server-card.json` or `mcp.json`, plus a live probe of its same-origin endpoint), `AI crawler policy` (robots.txt `Content-Signal`, named AI crawler groups, and named groups that drop the `*` Disallow rules), and `Sitemap/canonical agreement` (WARN on mismatches such as no-slash sitemap URLs versus trailing-slash canonicals). Any surface can be made a failure when missing with `required.apiCatalog|markdownTwins|linkHeaders|mcpServerCard|aiPolicy|canonicalConsistency` in the discovery policy; a present-but-malformed surface always fails. `agentSampleSize` (default 12) bounds live page sampling.
- **Discovery template v2** (`Web_Toolkit/templates/discovery/`, wired into `site-starter/*.package.json`): sitemap, content.json, search.json, llms.txt and JSON-LD now use trailing-slash canonical page URLs (`canonicalPagePath`), so the sitemap agrees with `<link rel="canonical">` (the old template listed `/about` while pages declared `/about/`; both URLs still work because Cloudflare redirects the slash-less form). Dates come from git (`scripts/refresh-page-lastmod.mjs` writes `src/data/page-lastmod.json`) and unknown dates are omitted instead of using the build clock; the sitemap drops `changefreq`/`priority` and excludes `/500`. New agent layer: `Schema.astro` as one `@graph` with stable `@id`s, `robots.txt` AI crawler policy from `siteConfig.aiPolicy` (Content-Signal, named crawler groups; training/AI-input crawlers are blocked when the policy says no) plus `ai.txt`, RFC 9727 `/.well-known/api-catalog`, Markdown twins and a whole-site bundle (`/site.md`, `/api/site.json`) plus per-page `Link`/`Vary` header rules from `scripts/discovery-postbuild.mjs`, `Accept: text/markdown` negotiation (`src/worker.ts`, `lib/negotiate.ts`, Workers only), per-IP rate limiting (`lib/ratelimit.ts`), `scripts/discovery-check.mjs`, and an optional read-only MCP server (`optional/mcp/`). Server-rendered pages (`prerender = false`) are skipped gracefully. Covered by `tests/discovery-template.test.mjs`.
- **discovery-doctor `--allow-loopback`** (and `assertPublicHttpUrl(url, label, { allowLoopback })` in `shared/lib/url-safety.mjs`): permits `localhost`, `127.0.0.0/8` and `::1` only, for testing a local Worker or preview server. Private LAN ranges, link-local and metadata hosts stay blocked, default behavior is unchanged, and it is CLI-only (a committed profile cannot enable it).
- **preview-check** (new tool): `lighthouse` (compact JSON scores, metrics and failing audits for a local preview or any URL, mobile and desktop), `layout` (horizontal overflow at 375/768/1440 with named offenders) and `motion` (reduced motion leaves no scroll-driven or infinite animation and no canvas, no above-the-fold text gated by opacity, no canvas on a phone viewport, real content with JavaScript off). Exit 2 on a failed check. Needs `playwright` in the project for `layout` and `motion`.
- **brand-doctor `og-pages`**: renders one 1200x630 Open Graph card per route from `og.spec.json` `pages` (plus an optional `pages_module` for data-driven pages such as one card per product, with optional screenshots) and writes the route map the layout reads for `og:image` and `twitter:image`. Dry run unless `--apply`.
- **templates/cinematic**: copy-ready motion and layout primitives (View Transitions, scroll-driven reveals, CSS scroll progress, ledger and index-label page system, optional WebGL2 hero field that refuses software renderers) with the performance contract that keeps pages at 100 on PageSpeed.
- **stylesheet-check `motion-reduced-guard`**: errors on `animation-timeline` or `@view-transition` in a stylesheet with no `prefers-reduced-motion` guard (a global `animation-duration` reset does not stop either).
- **site-snapshots** (new tool): `capture` photographs each page from a JSON list (reduced motion, consent banners dismissed or hidden, only visibly changed pages rewritten, failed captures keep the old image) and writes optimizable images plus a manifest; `check` reports missing, stale and drifted snapshots with exit 2. Configured by one `site-snapshots.config.json`; public hosts only unless `--allow-loopback`.
- **preview-check `contrast`**: resolves every visible text node against its real background (translucent layers composited, gradient stops evaluated) in dark and light schemes, optionally after a click such as opening the mobile menu, and lists WCAG AA failures. Added because axe/WCAGate report translucent and gradient backgrounds only as `cantTell`, which let white text on a pale gold button pass the gate.
- **templates/cinematic `circuit-trace.ts`**: cursor-driven circuit-board canvas (traces, pads, chips revealed around the pointer with travelling pulses); zero cost until the first mouse move and when idle.

### Changed

- **Version defaults refreshed** from the npm registry and Node release index (checked 2026-11-05): `.node-version` and `site-starter/.node-version` 26.7.0 → 26.13.0 (current LTS); starter pins `astro` ^7.4.7, `@astrojs/cloudflare` ^14.4.6, `vite` ^8.3.6, `wrangler` ^4.158.0, `@cloudflare/workers-types` ^5.20261104.1, `@types/node` ^26.6.6, `@astrojs/check` ^0.9.12, `@astrojs/upgrade` ^0.8.1, `playwright` ^1.65.0, `yaml` ^2.9.1, `yaml-language-server` ^2.0.0. `typescript` stays `^6.0.3` because `@astrojs/check` peers only on TypeScript 5 or 6.
- Starter `compatibility_date` 2026-07-18 → 2026-10-23 (accepted by Wrangler 4.156.0 / workerd 1.20261023.1 with no warnings); the date remains intentionally fixed until compatibility behavior is reviewed.
- Setup bootstrap manifest Node tarballs v26.7.0 → v26.13.0.

### Removed

- Starter templates no longer depend on `rimraf` or `cross-env`. `rimraf` pulled vulnerable `glob`/`minimatch` (3 moderate `npm audit` findings, even at its latest 6.1.3); `cross-env` was unused. The starter `clean` script now runs `Web_Toolkit/scripts/clean-local-cache.mjs`. Both templates now audit clean.

### Fixed

- **cache-purge** now finds the public site for the Astro Cloudflare Workers adapter: it uses `cloudflare.cachePurge.distSubdir` or `cloudflare.headers.distSubdir`, or auto-detects `dist/client` beside `dist/server`. Previously it walked `dist/` and produced `/client/...` and `/server/...` URLs that were never cached.
- **cache-purge** splits URL, prefix, and host purges into batches (default 100 per request, the Free/Pro/Business limit; `--batch-size`, `cloudflare.cachePurge.batchSize`, or `CF_CACHE_PURGE_BATCH_SIZE`, max 500). A bigger site no longer fails with Cloudflare error 1094, and `CF_CACHE_PURGE_BATCH_SIZE` is finally honored.
- **cache-purge** retries HTTP 429 using `Retry-After` (Free plan: 5 purge requests per minute) and, on a rejected batch, reports how many items were already purged.
- **cache-purge** now exits non-zero when the zone cannot be resolved or there is nothing to purge, instead of printing a warning and exiting 0.
- **cache-purge** prefix mode sends `host/path` prefixes without a scheme, query, or trailing slash, as Cloudflare requires, and warns when a prefix is a bare host (purges the whole host).

### Fixed (toolkit review)

- **Agent CLI contract**: all 28 packaged commands now pass a `toolkit-verify` help check requiring Usage, Flags, Examples, Notes, and Exit codes. Discovery Doctor and Instagram Clone now offer clean JSON stdout; Instagram Clone's no-argument invocation now succeeds with help instead of returning a usage error.

- **toolkit-purge** never follows symlinks, skips `node_modules` and `.git`, scopes `output`/`dist`/`.zip` removal, and refuses any target that resolves outside the toolkit root.
- **export-portable-toolkit `--to`** refuses the toolkit root, its parent, `/`, `$HOME`, and non-empty directories it did not create (unless `--force`), and never copies `.env*`, `.dev.vars*`, `*.pem`, or `*.key`.
- **privacy-check** scans every non-binary text file (not an extension allowlist) and detects `.dev.vars`/`.env.local` secrets, JSON/YAML assignments, Cloudflare (`cfut_`/`cfat_`/`cfk_`) and GitHub tokens, PEM private keys, and `/home/<user>` paths.
- **pagespeed-diagnostics** `raw-psi` exits 0 on success (it crashed on a string exit code), PSI requests time out after 180 s, API errors never echo the request URL (which carries the key), thresholds reject typos/NaN, and missing Lighthouse audits are reported instead of counted as 0.
- **stylesheet-check** fails when `--root` is missing or not a directory, never follows symlinks (a project's `Web_Toolkit` link was being scanned), and warns when it scans nothing.
- **stylesheet-check** accepts a `src/styles/tokens/` folder (not only `tokens.css`) as the token source, recognizes tokens imported from `global.css` or another top-level sheet such as `critical.css`, and gains `--exclude <paths>` to skip unbuilt archive/reference folders.
- **browser-diagnostics** now fails (exit 1) on production routes that return HTTP >= 400, time out, or when no routes were checked; development-host route errors warn.
- **Shared CLI parser** (`Web_Toolkit/shared/lib/cli.mjs`) replaces about two dozen hand-rolled copies. Boolean flags (`--skip-*`, `--no-*`, `--dry-run`, `--apply`, `--json`, ...) no longer swallow the next token (`site-doctor --skip-cloudflare run` used to print help and exit 0), and `--key=value` now works everywhere.
- `--help` exits 0 for **discovery-doctor** and **sourcing-doctor**; **cf-deploy-pages/workers** gained `--help` (previously `--help` ran the deploy command).
- **zone-harden** mutates only with an explicit `--apply`; `--dry-run=false` alone no longer applies changes, and `--dry-run` always wins.
- **registrar** `zone ensure` only creates a zone on a genuine "zone not found" (`ZoneNotFoundError`); auth/permission/5xx errors now fail instead of triggering creation. `registrar ping` no longer prints or saves any part of the API key.
- **Auto-update preflight** is skipped for `--help`, `--version`, and `--apply` invocations (`PORTABLE_TOOLKIT_AUTO_UPDATE_ON_APPLY=1` opts back in).

### Changed (tooling)

- PostHog Astro template `defaults` `2026-01-30` -> `2026-08-30` (latest in `@posthog/types` 's `CONFIG_DEFAULTS_DATES`, checked 2026-11-01).
- `npm test` runs every suite (`tests/*.test.mjs` and `Web_Toolkit/*/tests/*.test.mjs`): 158 tests pass in the 2026-11-05 validation run.

### Added

- `cache-purge` skips content-hashed `/_astro/` assets by default (`--include-assets` restores them), adds slashless twins of directory URLs (`--no-variants` disables), and supports profile `cloudflare.cachePurge.extraPaths` for SSR/API routes outside `dist/`.
- `cache-purge` is split into `src/commands/purge.mjs`, `src/lib/urls.mjs`, and `src/lib/cloudflare.mjs` with offline tests (`npm run test:cache`, included in `npm test`).

## [0.4.0] - 2026-10-26

### Added

- **Sourcing Doctor Wix harvest**: public storefront HTML + JSON-LD (no admin keys). Profile-driven shop paths, static pages, category rules, and catalog output. `sourcing-doctor audit|extract --site-profile`.
- **Standards-aware Discovery Doctor**: bounded sitemap XML parsing, llms.txt/security.txt/robots semantics, media-type checks, profile-driven public REST/MCP endpoints, same-origin discovery-link checks, and modern MCP `2026-07-28` discovery with legacy fallback.

### Changed

- **WCAG engine is WCAGate from GitHub**, not a re-bundle. `Web_Toolkit/wcag_auditor` is a site-profile wrapper. `npm install` in `Web_Toolkit/` fetches `github:imyourboyroy/WCAGate` (unpinned). Engine refresh is `npm run wcagate:update` (reinstalls the git spec; `npm update` does not). `core-path` prints `node_modules/@imyourboyroy/wcagate`. See `docs/decisions/ADR-wcagate-engine.md`.
- **Automatic toolkit freshness**: commands check once per 24 hours by default, fast-forward only a clean public `main` checkout, refresh WCAGate when its public `main` head changes, and report skipped/error states under `Web_Toolkit/.runtime/toolkit-auto-update.json`.
- **site-starter** `build:headers:*` scripts pass `--apply` so `headers-deploy write-deploy` actually writes during build (the CLI is dry-run without it).
- **clean-local-cache** uses `node:fs/promises.rm` instead of `rimraf`, so it still works after `Web_Toolkit/node_modules` exists for WCAGate.
- **Discovery templates** now emit blockquote-shaped llms documents, escaped sitemap XML, and RFC 9116-compatible security.txt `Expires`/URI fields.
- **Discovery Doctor defaults** now require the core production discovery contract (`llms.txt`, `llms-full.txt`, `humans.txt`, `security.txt`, structured content, headers, and JSON-LD); runtime-only search remains opt-in, profiles may explicitly relax requirements, and development/preview mode correctly relaxes sitemap/security.txt for non-indexable hosts.

## [0.3.9] - 2026-08-11

### Added

- **Glassmorphism / frost UI WCAG path** (`wcag_auditor` 2.0.3): `docs/GLASSMORPHISM.md`, starter `frost-glass-contrast` evidence, suppressions with `outcomes: ["cantTell"]`, frost-aware axe remediations.
- **Brand Guide → tokens**: `brand-doctor sync-tokens` managed block in `src/styles/tokens.css`.
- **Astro Image default posture**: site-starter `OptimizedPicture`, Workers `imageService: 'compile'`, image-pipeline / site-readiness posture checks.
- **cache-purge warm**, discovery-doctor modular validate/report + tests, registrar MX gate, stylesheet-check architecture depth + README.
- **package-updater Astro path**: runs `npx --yes @astrojs/upgrade` (dry-run unless `--apply`; `--skip-astro-upgrade` / `--astro-tag`).
- Skills: `brand-doctor`, `discovery-doctor`, `image-pipeline`, `pagespeed-diagnostics`, `site-maintenance`, `wcag-auditor`.
- Client `.node-version` in `site-starter` (synced from root pin).

### Fixed

- discovery-doctor fail-closed (exit `2` on fail); registrar await + profile `.env` precedence; CF pages/deploy/analytics/headers/fix-permissions dry-run until `--apply`.
- DNS match by name+type with pagination; SSL rollback hosts scoped; site-quality-smoke exact `Disallow: /` + legal/cookie heuristics.
- Fail-loud toolkit-report / package-updater / project-init / site-readiness / Setup_agent_environment (`pwsh`).
- PSI single-fetch; privacy-check broader patterns.

### Changed

- Report path policy documented: client `output/` vs toolkit `.runtime/`.
- Removed `Web_Toolkit/.node-version` — canonical pin is repo root `.node-version`.
- HOW_TO honesty + module README / OPERATIONS / START_HERE alignment.

## [0.3.8] - 2026-08-11

### Fixed

- **`init-site-profile create`** now writes `<project-root>/<site-id>.site-profile.json` by default (client project) instead of toolkit `Web_Toolkit/site-profiles/`.
- Schema `$schema` prefers `./Web_Toolkit/site-profile.schema.json` for client profiles; deploy command defaults match site-starter scripts.

### Changed

- Expanded `init_site_profile` README/help with full flags, agent protocol, and `requirements --json`.
- Root `.env.example` is a **pointer only**; canonical client template remains `site-starter/.env.example` (optional operator defaults in `Web_Toolkit/.env.example`).

## [0.3.7] - 2026-08-11

### Changed

- **`.env` division of labor** (`site-starter/.env.example` + project-bootstrap): **A** user-pasted required APIs (Cloudflare token, PageSpeed), **B** agent+user naming/IDs, **C** recommended PostHog + GA4 (explain WHY early in S5/S7), **D** optional features.
- Porkbun documented as an **optional example** registrar integration — not required.
- Onboarding S5/S7, `site-onboarding`, checklist, and READMEs updated so agents propose names, challenge vague answers, and do not dump a blank `.env` on the user.

## [0.3.6] - 2026-08-11

### Added

- **Staged agent onboarding** (`docs/agent-skills/ONBOARDING_STAGES.md` S0–S9) with stop-and-ask checkpoints for host setup, Cloudflare token/MCP, Workers vs Pages, scaffold, readiness, and production auth.
- Core skill **`site-onboarding`** (`install_by_default: false`) — thin loader for the stages contract; wired in router, START_HERE, SKILL_INDEX, skill-pack, and project-init link lists.
- cf-agent token handoff recipe documenting Edit/Write scopes including **API Tokens Write**, **Account API Tokens Write**, and **Gateway Write**.

### Changed

- README get-started paste prompt and `docs/agent-skills/getting-started.md` lead with README → ONBOARDING_STAGES / `site-onboarding`.
- `REQUIRED_PERMISSION_NAMES` extended for token repair + Cloudflare One Gateway work.
- Host bootstrap sets `pyenv global` to the desired installed Python line in addition to workspace `local` venv (bash + PowerShell).
- Setup_agent_environment README Node pin wording refreshed to `.node-version` `26.7.0`.

## [0.3.5] - 2026-08-11

### Changed

- **Skill defaults are light**: only `portable-web-toolkit-router` has `install_by_default: true`. Core/optional skills require explicit `--skills` (project-init still links the core four for new sites).
- Refreshed site-starter floors via `package-updater`: Astro `^7.2.1`, `@astrojs/cloudflare` `^14.2.1`, Wrangler `^4.120.1`, Vite `^8.2.1`, `@astrojs/upgrade` `^0.7.4`, `@types/node` `^26.2.0`, `@cloudflare/workers-types` `^5.20260811.1`. TypeScript stays `^6.0.3` (capped; registry latest is 7.x).
- `.node-version` and host-bootstrap Node tarballs → **26.7.0**.

### Fixed

- Playwright axe focus-indicator probe scrolls focused controls into view with `scroll-behavior: auto` so headless Chromium does not no-op smooth scroll.

## [0.3.4] - 2026-08-04

### Fixed

- **WCAG Auditor stays inside Web_Toolkit**: website workflows no longer resolve `AI/wcag-auditor`, `WCAG_AUDITOR_ROOT`, or sibling checkouts. `core-path` always points at `Web_Toolkit/wcag_auditor`.
- Playwright CJS interop when browsers live under `playwright.default` (fixes “Unsupported Playwright browser: chromium”).

### Changed

- Re-bundled the full evidence engine under `Web_Toolkit/wcag_auditor` (self-contained for toolkit-managed sites).

## [0.3.3] - 2026-08-04

### Added

- Thin **WCAG Auditor bridge** (`Web_Toolkit/wcag_auditor/`) wired to the hard-segregated standalone package `@roydawsoniv/wcag-auditor` (`AI/wcag-auditor`).
- Launchers: `WCAG_Auditor.bat` / `WCAG_Auditor.command`.
- Site-profile schema + example knobs under `diagnostics.wcagAuditor`.
- Optional `site-doctor --wcag` step; OPERATIONS step 10a; agent routing in `START_HERE.md` / skills operations index.

### Changed

- Accessibility evidence engine is **hard-segregated** from the toolkit: core adapters/tests/docs live in `AI/wcag-auditor`; the toolkit keeps only a site-profile / Astro bridge.
- Refreshed `site-starter` floors to current registry latest: Astro `^7.1.6`, `@astrojs/cloudflare` `^14.1.7`, Wrangler `^4.118.0`, Vite `^8.2.0`, Playwright `^1.62.1`; `.node-version` → `26.6.0`. TypeScript stays on `^6.0.3` until `@astrojs/check` supports 7.x.

## [0.3.2] - 2026-07-29

### Added

- Introduced `portable-web-toolkit-router` minimalist global skill (~60 tokens) for on-demand skill routing across Antigravity, Cursor, Claude Code, Codex, and Copilot.
- Added `scripts/manage-project-skills.mjs` cross-platform manager for symlinking required skills into `<project>/.agents/skills/` with `--auto` optional skill detection.
- Created `docs/agent-skills/SKILL_INDEX.md` fast-lookup selection matrix for AI coding agents.
- Integrated automatic skill symlink scaffolding in `project-init apply-safe` and `.agents/skills/` health checks in `site-readiness`.

### Changed

- Updated skill status helper `scripts/check-agent-skills.mjs` to classify valid toolkit skill symlinks as `current-symlink`.
- Purged heavy web skills from global home discovery directories, moving all web skills to per-project symlink scope to prevent context bloat in non-web projects.

## [0.3.1] - 2026-07-26

### Fixed

- Corrected the documented skill-hash refresh command to use the tracked
  `scripts/update-skill-hashes.mjs` helper.

## [0.3.0] - 2026-07-26

### Added

- Versioned skill manifest, per-skill metadata, content hashes, and portable
  activation metadata.
- Read-only multi-client skill status reporting and an agent-driven,
  transactional installation protocol.
- Recovered and generalized the local-only Vectorize Pipeline as an optional,
  experimental skill and toolkit module.
- Release metadata validation, governance tests, a repository privacy gate, and
  pinned GitHub Actions validation.
- Contribution and private vulnerability-reporting guidance.

### Changed

- Refactored the master skill into a compact router with conditional references.
- Made client-repository policy authoritative for client work.
- Retired automatic skill replacement from compatibility installer and updater
  entrypoints; both now report status only.
- Kept governance files outside `skills/` so Antigravity discovers exactly the
  six functional skills.
- Added competing-owner activation fixtures and safety preflights to all six
  skills. Current skill versions are recorded in `skill-pack.json`.
- Aligned Vectorize Pipeline `0.1.1` with the repository's MIT license.
- Aligned all toolkit package metadata with the repository's MIT license.

### Fixed

- Update checks now distinguish a newer public version from a newer local
  development version.
- Privacy scans ignore reserved documentation domains while continuing to
  report real email addresses and credentials.

## [0.2.6] - 2026-07-18

### Fixed

- **macOS setup elevation** — `.command` launchers never receive Admin from Finder by themselves; bootstrap now shows a GUI administrator dialog, then requires a working `sudo` ticket. Failed elevation **stops** installs (no more `ensure_sudo || true` soft-continue).
- **macOS Node without Homebrew** — Node installs from the official `nodejs.org` darwin tarball into `/usr/local/lib/nodejs` (Homebrew is optional fallback only). Manifest keys: `tool.node.macos.{arm64,x64}.tarball_url`, `tool.node.posix.prefer_official_tarball`.
- **macOS Git / Xcode CLT** — bootstrap waits for the async Command Line Tools installer and fails clearly if Git is still missing (no silent “skipped”).
- **`.command` Terminal UX** — stay-open after double-click with clear admin messaging (pause skipped for `--yes`/`--agent`).

### Added

- **pyenv-gui (required)** — host bootstrap installs/detects the pyenv-native GUI companion; launch with `pyenv gui`. Manifest keys under `tool.pyenv_gui.*`; doctor fails when missing.
- **Executable launchers** — all tracked `.sh` / `.command` files are `100755` so clones/downloads are double-clickable; portable exports preserve mode bits.
- **Node-free setup launchers** — `setup-interactive.sh` / `setup-interactive.ps1` so `.command` / `.sh` / `.bat` work on machines without Node; bootstrap installs Node when missing.
- **Single-prompt agent setup** — scans missing/outdated tools, one Y (or `--yes`/`--agent`); coding agents run setup and let sudo/UAC prompt the user
- **Dynamic README versions** — `scripts/sync-readme-versions.mjs` syncs `VERSION`, `.node-version`, and site-starter pins into README (`npm run sync:readme-versions`)

### Changed

- **Python policy made explicit** — `tool.python.install_policy = pyenv-native-only`. Docs, wizard, and doctor no longer suggest system/winget/Homebrew Python; setup doctor lists `pyenv` + `pyenv-gui` as required.
- **site-starter** (Workers + Pages) — dependency floors bumped to current npm latest with `^` ranges:
  - `astro` `^7.1.1`, `@astrojs/cloudflare` `^14.1.3`, `vite` `^8.1.5`
  - `wrangler` `^4.112.0`, `@cloudflare/workers-types` `^5.20260718.1` (v5; required by current Wrangler peers)
  - `@types/node` `^26.1.1`, `yaml-language-server` `^1.24.0`
  - TypeScript stays on `^6.0.3` (latest 6.x) — `@astrojs/check` peers do not allow TypeScript 7 yet
- **site-starter** — `compatibility_date` → `2026-07-18`; Pages template now includes `@cloudflare/workers-types` + `cross-env`; `upgrade:wrangler` points at `Web_Toolkit/scripts/check-wrangler-versions.mjs`
- **Node pin** — `.node-version` + Linux bootstrap tarballs → `26.5.0` (`engines.node` remains `>=26`)
- **Python / pyenv-native policy** — desired Python `3.14` (fallback `3.14.6`, minimum still `3.13.0`); `pyenv-native` minimum `0.2.30`; setup doctor winget/brew targets updated off Python 3.12
- **package-updater** — preserves `^` / `~` / `>=` operators; caps `typescript` at latest 6.x until `@astrojs/check` supports 7

## [0.2.5] - 2026-06-25

### Added

- **Full Zenith discovery templates** — humans.txt, security.txt, content/search APIs, `lib/discovery/*`, Schema.astro, middleware (generic `site-config.ts`, no client data)
- **`Web_Toolkit/scripts/clean-local-cache.mjs`**, **`check-wrangler-versions.mjs`** — run from linked client projects
- **site-starter** — `astro.config.*.example.mjs`, structural `src/styles/tokens.css` + `global.css`

### Changed

- **site-starter `package.json`** — npm scripts call `./Web_Toolkit/` CLIs directly (headers, readiness, cache, wrangler check)
- **site-readiness** — checks `Web_Toolkit` link instead of local `scripts/` folder
- **`.gitignore`** — `**/Private_Site_Profiles/`

### Removed

- Legacy root **`templates/`** folder (superseded by `site-starter/`)
- **`site-starter/scripts/`** duplicate wrappers (logic lives in `Web_Toolkit/`)

## [0.2.3] - 2026-06-25

### Removed

- GitHub publish tooling (`publish-github.mjs`, `set-github-topics.mjs`, `verify-secrets-not-tracked.mjs`, `docs/github-repository.*`) — not part of the web toolkit product
- `MEMORY.example.md`, `RED_TEAM_REPORT.example.md` — operator notes belong in client projects, not the distribution repo
- `GH_TOKEN` / `GITHUB_TOKEN` placeholders from `.env.example` files

### Changed

- **README** / **AGENTS.md** — secrets and session memory documented for **client projects** only
- **Gitignore** — all `MEMORY.md` / `RED_TEAM_REPORT.md` paths local-only (no committed examples)

## [0.2.2] - 2026-06-25

### Added

- **`MEMORY.example.md`** and **`RED_TEAM_REPORT.example.md`** — committed templates; local copies gitignored
- **`docs/templates/AGENT.template.md`** — universal operator template moved out of agent entry path
- **`docs/templates/README.md`**, **`skills/CONTRIBUTING.md`**
- **`docs/github-repository.json`** — public GitHub description + topics (no secrets)
- **`scripts/set-github-topics.mjs`**, **`scripts/publish-github.mjs`**, **`scripts/verify-secrets-not-tracked.mjs`** — safe publish flow; tokens read from gitignored `.env` only
- GitHub token detection in **`privacy_check`** patterns

### Changed

- **Gitignore** — hardened for `.env`, `.env.local`, `secrets/`, `github-repository.local.json`; operator `MEMORY.md` / `RED_TEAM_REPORT.md` stay local
- **Removed** deprecated `Web_Toolkit/AGENT.md`; agents use `START_HERE.md` + `AGENTS.md` only
- **`ARCHITECTURE.md`** — v0.2.x agentic layout, site-readiness orchestrator, skill extension guide
- **`OPERATIONS.md`** — points agents to site-readiness JSON first
- **`portable-web-toolkit` skill** — deduplicated session-start blocks
- Stylesheet-check and discovery template refs → `AGENTS.md` (not universal template)

## [0.2.1] - 2026-06-25

### Added

- **MIT `LICENSE`** at repo root; aligned `plugin.json` and package metadata
- **`scripts/link-web-toolkit.mjs`**, **`install-agent-skills.mjs`**, **`update-toolkit.mjs`** — cross-platform entry points
- **`skills/CROSS_PLATFORM.md`** — Windows / macOS / Linux conventions
- **Interactive setup wizard** — `setup-interactive.mjs` + `setup-menu.json`; per-component opt-in/out
- **Root launchers** — `Setup_Agent_Environment.sh` / `.command` (macOS/Linux)
- **`Web_Toolkit/registrar/README.md`**

### Changed

- **README** — user-first copy; single AI agent install prompt; optional machine setup wizard
- **Node policy** — unified at `>=26` (`.node-version` `26.4.0`, manifest, `engines`, site-starter)
- **`Setup_Agent_Environment.*`** — interactive menu before bootstrap; repo-root workspace default
- **`TOOLKIT_TEMPLATES.md`** — points to `site-starter/` (removed dead in-toolkit paths)
- **`Web_Toolkit/README.md`** — `site_quality_smoke` replaces broken `smoke_doctor` link
- Site-starter examples use neutral client names (no project-specific folders)
- `site-readiness` link fix uses `link-web-toolkit.mjs`

## [0.2.0] - 2026-06-25

### Added

- **Zero-research layer:** `START_HERE.md`, five agent skills
- **`site-starter/`** — Workers and Pages templates + helper scripts
- **`site_readiness`** CLI — sandbox-aware run-all checks
- **`instagram_clone`** — env-driven handle, audit subcommand
- **`scripts/update-toolkit.*`** and **`scripts/check-toolkit-update.mjs`**
- Manifest-driven batch quality smoke (operator manifest gitignored)

### Changed

- Repo root is toolkit meta only; `site-readiness` leads OPERATIONS/AGENTS
- Hardened `.gitignore` for operator data

## [0.1.0] - 2026-06-16

- Initial toolkit with cross-platform agent skills installer
