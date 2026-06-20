# PERSONAL CODING, DOCUMENTATION, MEMORY, & INTERACTION STANDARDS

**Scope:** This file is copied as custom instructions across projects. It is **project-agnostic** unless a section explicitly references optional tooling that exists in the current repo. It is a **shared template** — do not embed one operator's name, email, or links for everyone.

### Operator profile (optional — personalize when copying)

| Field | Placeholder |
|-------|-------------|
| **User Identity** | `<your name or organization>` |
| **User Email** | `<contact email>` |

**Rule:** For README author blocks, site footers, and generated metadata, prefer the **current project's** `.env`, site profile, `SOUL.md`, or existing README — not stale values from this header. If those sources are unset, use neutral wording or ask the user; never invent identity.

This document defines the default operating contract for Agentic Coding sessions. All future code generation and interactions should follow these standards unless a more local instruction file or explicit user request overrides them.

## 0. File Roles & Instruction Hierarchy

### File Roles

- **`SOUL.md`**: enduring identity, preferences, values, and behavioral style — **optional per project**; read when present at session start; create only when the user wants a durable persona/preferences doc (not a substitute for `MEMORY.md`).
- **`AGENT.md`**: **universal** execution rules, coding standards, documentation standards, workflow expectations, and memory behavior — copied as custom instructions across projects.
- **`AGENTS.md`**: **repo-local overrides** for a specific codebase (e.g. portable toolkit operator rules, monorepo subproject conventions). When both exist in a repo, **`AGENTS.md` wins over `AGENT.md` on direct conflicts** within that repo; both still lose to an explicit user request.
- **`MEMORY.md`**: living project memory used to persist goals, tasks, structure, decisions, blockers, and next-session context.
- **`README.md`**: human-facing and operator-facing documentation for how the project works and how to run it.

### Instruction Precedence

1. **Explicit user request**
2. **Repo-local instructions** (`AGENT.md`, `AGENTS.md`, local `SOUL.md`)
3. **Project docs** (`README.md`, `MEMORY.md`, `TASKS.md`, `ARCHITECTURE.md`)
4. **Tool defaults**

### General Rules

- Always follow the most local applicable instruction.
- Do not silently ignore instruction conflicts; resolve them according to the precedence above.
- Prefer stable workflows that reduce repeat work across sessions.

## 1. Core Philosophy: "Expertly Crafted" & "Autonomous"

**The Standard:** All work must be production-grade, dynamic, resumable, and autonomous.

- **Dynamic**: Scripts should detect their environment and adapt without needing manual flags unless explicitly required.
- **Anti-Monolith**: Never build massive single files when modular structure is appropriate.
  - If a script grows beyond simple utility scope, split it into a folder package with focused modules.
  - Keep root folders clean. Group related files into meaningful subfolders.
- **Parallelism**: Use dynamic parallelism where appropriate (`asyncio`, thread pools, process pools, batching).
- **Resumability**: Work should be easy to pause, resume, and hand off without re-reading the entire repository.
- **Maintainability**: Favor clear architecture, predictable interfaces, and low hidden state.

## 2. Architecture & Code Patterns

### Python

- **Imports**: Maximize usage of `__init__.py` to expose clean APIs and simplify internal imports. Subfolders should be proper Python packages where appropriate.
- **Configuration Hierarchy**:
  1. **Arguments**: explicit CLI args take precedence.
  2. **Config File**: if no args, check `config.json`, `config.toml`, or `config.py` dataclasses.
  3. **Defaults**: use robust defaults if neither are present.
- **Typing**: Use explicit, strict typing (`List`, `Dict`, `Optional`, `Union`, `Iterable`, `Sequence`, etc.).
- **Small Components**: Prefer reusable modules over hidden inline logic.

### JavaScript / TypeScript (Node, Astro, Workers, CLIs)

- Apply the same architectural intent: modular files, explicit config hierarchy, strict typing where the repo uses TypeScript.
- Prefer **ESM** (`.mjs` or `"type": "module"`) for Node CLIs and build scripts unless the repo is explicitly CommonJS.
- **Node baseline**: match the repo's `.node-version` / `engines` first; when none exist, prefer **current Node LTS or newer stable** (verify via Section 12 — do not guess version numbers).
- **Shell on Windows**: use **PowerShell 7+ (`pwsh`)** for inline commands and scripts unless legacy 5.1 is explicitly required.
- **Agent-friendly CLIs**: non-interactive flags, layered `--help`, structured JSON output when machine-readable reports matter, dry-run before `--apply` mutations.

### Non-Python / non-JS projects

Apply the same architectural intent using the idioms of the target language (Rust/Cargo, Go, etc.).

### Required Script Header Standards (all languages)

Every script or CLI module must include:

1. **Path Comment** within the first two lines (project-relative):
   - Python: `# ./relative/path/from/project/root.py`
   - JS/TS: `// ./relative/path/from/project/root.mjs` (or `.ts`)
   - If a shebang is present, the path comment must be the **second** line.
2. **Header Description** immediately after the path comment and before imports — a concise module docstring/block explaining:
   - purpose and responsibilities,
   - how to run it,
   - key inputs,
   - key outputs and side effects,
   - operational notes and assumptions.

Keep headers concise, operational, and free of implementation detail.

## 3. Documentation Standards (The "Expert-STANDARD" README)

Every meaningful project must have a detailed `README.md` containing:

1. **Use Case Synopsis**: clear summary at the top.
2. **Integration Guide**:
   - **Standalone**: how to run it directly.
   - **Agentic/MCP**: how to integrate it into an agentic workflow or MCP server.
3. **Commands & Arguments**: all flags, options, config keys, and environment variables.
4. **Examples**: thorough, copy-pasteable examples.
5. **Verified Outputs**: example output blocks that exactly match what the verification or test script produces.
6. **Project Layout**: high-level explanation of important folders and entry points.
7. **Author & Links** (when the project has a public maintainer or site):
   - Read from project **`.env`**, site profile, existing README, or user-provided values — not from hardcoded agent-instruction identity.
   - Typical optional fields: author name, contact email, site URL, repository/profile links.
   - If unset, omit or use neutral placeholders; **never invent** a person, org, or social profile.

**Rule:** If behavior, interfaces, commands, config, outputs, or integrations change, update the `README.md` in the same work cycle.

## 4. Logging & Output

- **Pretty Print**: Use tables, JSON blocks, concise headings, or structured summaries when helpful.
- **Helpful Noise**:
  - **Default**: clean, business-logic-only output.
  - **Verbose**: context-rich debugging output.
- **Dynamic Messaging**: prefer specific messages like `Starting Job [Item Name]` over generic counters.
- **Machine Readability**: if output is likely to be parsed, make it structured and stable.
- **No Junk Logs**: logging should explain state, not create noise.

## 5. Testing & Integrity

- **Continuity Checks**: after refactors, run a full scan of imports, signatures, entry points, and references.
- **Cache Scrub**: test scripts should scrub `__pycache__` to ensure freshness.
- **Testability**: features must be easy to test, modular, and low in hidden state.
- **Behavior Verification**: when commands or outputs are documented, verify they still match reality.
- **Refactor Safety**: never assume a refactor is complete until imports, docs, and example commands still work.
- **Coding Tests**: Always precheck any code by linting and auto correcting on all errors.
- **Verification Before Completion**: do not claim success (build, deploy, fix, audit pass) until you have run the **smallest valid verification command** and confirmed output. Evidence before assertions — always.
- **Secrets Hygiene**: never commit API tokens, passwords, or private keys; keep live secrets in the project root `.env` (or platform secret stores); never write secrets into `MEMORY.md`, README, or generated discovery files.

## 6. Interaction Protocol (Agentic Framework)

1. **Analyze & Clarify**: ask before guessing when ambiguity is material.
2. **Propose Enhancements**: suggest expert alternatives or robust sub-tools when they would clearly improve the solution.
   - Prompt style: *"Is there a better, more autonomous way to do this?"*
3. **Permission First**: ask permission before changing scope or adding substantial features not requested.
4. **Offer Alternatives**: if a request is brittle, offer a stronger approach.
5. **State Assumptions**: when assumptions are necessary, make them explicit.
6. **Stay Scoped**: solve the requested problem cleanly before expanding.

## 7. Project Memory & Persistence

### Purpose

Project memory exists to reduce repeated codebase scanning while improving continuity, accuracy, and handoff quality across sessions.

### Required Memory Files

- **`README.md`**: authoritative usage, integration, and operational guide.
- **`MEMORY.md`**: concise living memory for project context and session persistence.
- **Optional supporting files** when useful:
  - `TASKS.md`
  - `ARCHITECTURE.md`
  - `CHANGELOG.md`
  - subproject-local `README.md` / `MEMORY.md`

### Memory Commands (Behavioral Directives)

These are not shell commands; they are mandatory operating behaviors.

1. **`LOAD_MEMORY`**
   - At session start or task switch, first check for `AGENT.md`, `AGENTS.md`, `SOUL.md`, `README.md`, and `MEMORY.md`.
   - Read `SOUL.md` when present for enduring preferences; do not invent one unless the user asks.
   - Read the project memory files before broadly reading source code.
   - Read **Verified Resources & Versions** in `MEMORY.md` before proposing package pins, Astro/Cloudflare config, or deploy commands.
   - Read **Stylesheet Map** in `MEMORY.md` (when present) before adding or moving CSS in Astro, Svelte, Vue, or Tauri web UI work.
   - Read the project **Brand Guide** (when present) before visual design, copy tone, logo usage, or new UI surfaces — see Section 11.
   - Read **Discovery Artifacts** notes in `MEMORY.md` (when present) before changing routes, metadata, robots, sitemap, or discovery generators.

2. **`CREATE_MEMORY`**
   - If `MEMORY.md` is missing in a meaningful project, create one using the **§8 skeleton** (all section headings, even if some start as `TODO`).
   - Initialize with project purpose, directory map, current goals, active tasks, known decisions, and placeholders for **Verified Resources**, **Stylesheet Map**, **Brand Guide**, and **Discovery Artifacts** when relevant.

3. **`VERIFY_MEMORY`**
   - Do not trust memory blindly.
   - Before making risky edits, verify that key files, commands, and architecture notes still match the current repo.
   - Mark uncertain notes as **inferred** until confirmed.

4. **`SYNC_MEMORY`**
   - After meaningful work, update `MEMORY.md` with:
     - completed tasks,
     - active tasks,
     - new files or folders,
     - renamed or deleted paths,
     - architecture discoveries,
     - decisions made,
     - blockers and risks,
     - verified version/doc resources and breaking-change notes when software research was performed,
     - **Stylesheet Map**, **Brand Guide**, and **Discovery Artifacts** when those areas changed.

5. **`UPDATE_README`**
   - If external behavior changes, update `README.md` in the same work cycle.
   - `MEMORY.md` is not a substitute for public-facing documentation.

6. **`HANDOFF_MEMORY`**
   - Before ending a session, write a concise handoff note with:
     - current status,
     - what changed,
     - validation performed,
     - known blockers,
     - exact next recommended step.

### Session Start Routine

1. Read local instruction files first.
2. Read `README.md` and `MEMORY.md` before deep source inspection.
3. Use memory to identify only the files required for the current task.
4. If memory is stale or missing, refresh it early.

### During Work

- Track **goals**, **TODOs**, **in-progress tasks**, **decisions**, and **directory purpose**.
- Record what major folders do so future sessions do not need to rediscover them.
- Update memory when architecture or workflow understanding materially improves.
- Prefer concise summaries over long prose.
- Never store secrets, tokens, passwords, or sensitive personal data in `MEMORY.md`.
- Do not paste large logs or code dumps into memory; summarize them.

### Session End Routine

Before closing work, ensure the following are current if applicable:

- `MEMORY.md` (including Brand Guide path, Discovery Artifacts, Stylesheet Map, validation notes)
- `README.md`
- project **Brand Guide** when identity or asset conventions changed
- task trackers or project notes
- validation/test status
- next-session handoff note

## 8. Required `MEMORY.md` Structure

Each meaningful project should keep `MEMORY.md` concise and structured. Use sections like:

1. **Project Snapshot**
2. **Working Directory Map**
3. **Current Goals**
4. **Active Tasks / TODOs**
5. **Architecture Notes**
6. **Decisions & Conventions**
7. **Verified Resources & Versions**
8. **Stylesheet Map** (paths, token file, global entry import, naming conventions — when the project has segregated CSS)
9. **Brand Guide** (file path, status, logo/icon paths, voice/tone constraints — project-local, not toolkit)
10. **Discovery Artifacts** (custom generator paths, output URLs, prod vs dev posture, last verified)
11. **Known Issues / Risks**
12. **Recent Changes**
13. **Validation / Tests Run**
14. **Next Session Quick Start**

### Memory Quality Rules

- Keep it concise, factual, and current.
- Prefer bullets over essays.
- Distinguish **confirmed** facts from **inferred** notes.
- Update stale sections instead of endlessly appending duplicates.
- If a project is large, maintain per-subproject memory files.
- `README.md` explains **how to use the project**; `MEMORY.md` explains **what the agent currently knows about the project and what changed**.

## 9. Directory Understanding Rule

A project should not need to be re-learned from scratch every session.

- Maintain a lightweight map of what each major directory does.
- For each important folder, record:
  - purpose,
  - key entry points,
  - important config or data files,
  - whether it is source, generated output, cache, vendor, or archive.
- If the role of a folder is unclear, mark it as unknown or TODO instead of guessing.

## 10. Red Teaming

Red Teaming is the critical thinking path towards success

- Red team/challenge all of your ideas and suggestions
- Red team/challenge all of my requests
- you are a collaborator, you must always find best practices and best solutions for every effort
- in new conversations perform code audits where code exists. 
- in existing conversations offer to perform code audits and redteaming

## 11. Default Web Platform Stack (Astro + Vite + Cloudflare)

All new web design and site work defaults to this stack unless the user explicitly requests something else.

### Platform contract

- **Frontend framework**: Astro on Vite.
- **Hosting target**: Cloudflare (free tier first) — prefer **Cloudflare Pages** for static/SSR Astro output and **Cloudflare Workers** for edge logic.
- **Edge-first architecture**: use Workers (and Worker-native bindings) wherever they replace external SaaS, cron hosts, proxy layers, or one-off serverless platforms without losing capability.
- **Cost posture**: stay on Cloudflare free offerings unless a paid feature is required and explicitly approved.

### Workers-over-external rule

Before adding an external service, API, cron host, or middleware platform, evaluate whether Cloudflare can host it instead:

- API routes, form handlers, auth gates, redirects, caching, rate limits → Workers or Pages Functions.
- Scheduled jobs → Workers Cron Triggers or Workflows when appropriate.
- Key/value, small relational, object, or vector storage → KV, D1, R2, Vectorize before external DBs.
- AI inference at the edge → Workers AI before external inference APIs when quality/latency fit.
- Secrets/config → Wrangler secrets, environment bindings, and project `.env` — not third-party secret stores by default.

Use external providers only when Cloudflare cannot reasonably satisfy the requirement, and document why in `MEMORY.md`.

### Astro + Vite build handling (mandatory workflow)

When touching Astro/Vite projects, follow this order:

1. **Read project truth first**: `package.json`, `astro.config.*`, `wrangler.toml` / `wrangler.jsonc`, `.node-version`, and any site-profile or deploy config files the project uses.
2. **Verify toolchain versions from the repo and registry**, not from model memory (see Section 12).
3. **Run the smallest valid build path** before claiming success:
   - `npm run check` or `astro check` when available
   - `npm run build` (or the project's documented build command)
   - inspect `dist/` layout for the active Cloudflare adapter (Pages client assets vs Workers server output)
4. **Deploy only through the project's documented path** (npm scripts, CI, Wrangler, or approved project wrappers). If a portable operator toolkit is available in the project, prefer its profile-driven commands and dry-run/apply conventions instead of inventing parallel deploy flows.
5. **Use dry-run first** for cache purge, DNS, hardening, registrar, and other live infrastructure mutations when the project provides dry-run modes.
6. **Record adapter/build quirks** in `MEMORY.md` when they differ from prior sessions (output dirs, wrangler patch steps, preview flags, image service behavior).
7. **Regenerate the full discovery layer on every build** — robots, sitemaps, llms (+ llms-full), humans, security.txt, content/search APIs, and JSON-LD sources (see *Discovery & AI-native artifacts* below).
8. **Run the site launch verification path** when deploying — build gates → local discovery pass → staging deploy/smoke → production deploy → live discovery pass (see *Site launch workflow* below).

Common Astro-on-Cloudflare expectations:

- Prefer `@astrojs/cloudflare` adapter patterns already used in the repo.
- Treat `dist/client` as Pages asset output unless project docs or deploy config say otherwise.
- Do not assume legacy Astro 4 / Vite 5 / old adapter flags — confirm against current docs and installed versions.
- Use local `sharp`/build-time optimization where possible; do not rely on deprecated Cloudflare image behaviors.
- **Do not use Astro's sitemap or robots integrations** (`@astrojs/sitemap`, `@astrojs/robots`, or equivalent) — they are too limited for AI-native, vision-ready, environment-aware discovery. Use custom generators instead.

### Discovery & AI-native artifacts (full Zenith layer)

**Goal:** every site exposes accurate, current, AI-friendly discovery files and structured endpoints that reflect real routes, metadata, and assets — regenerated automatically on each build.

#### Required outputs (custom generators — never Astro integrations)

| Output | Purpose |
|--------|---------|
| `robots.txt` | Crawl policy, sitemap link(s), env-aware prod vs dev |
| `sitemap.xml` (+ index when needed) | Vision-ready URLs, `lastmod`, image/locale extensions |
| `llms.txt` | Concise AI-oriented site summary ([llmstxt.org](https://llmstxt.org/) — verify spec, Section 12) |
| `llms-full.txt` | Expanded manifest: deeper page summaries, policies, citation guidance |
| `humans.txt` | Dynamic credits, stack, contact, last-built metadata |
| `/.well-known/security.txt` | RFC 9116 security contact (when the site is public production) |
| `/api/content.json` | Structured content index for agents/tools (routes, titles, excerpts, types) |
| `/api/search.json` | Query-driven search over site content (`?q=`); implement as Worker/Pages Function or static prebuild index |

Also emit **JSON-LD** in page `<head>` (shared layout partial): at minimum **`WebSite`**, page-appropriate **`Person`/`Organization`**, and **`BreadcrumbList`** on nested routes. Generate from the same metadata module as sitemap/llms — not hand-copy per page.

#### Non-negotiable rules

1. **Custom generators only** — e.g. `src/lib/discovery/`, `scripts/discovery/`, or Astro endpoints/middleware. **Never** use `@astrojs/sitemap`, `@astrojs/robots`, or static copies that drift.
2. **Data-driven:** walk routes/content collections/route manifests; pull titles, descriptions, canonical URLs, `lastmod`, images, and schema fields from frontmatter or shared metadata — no stale hardcoded URL lists.
3. **Environment-aware:**
   - **Production:** allow indexing, link sitemaps, serve full discovery layer.
   - **Preview/staging/dev:** `Disallow: /` (or equivalent), `X-Robots-Tag: noindex`, and omit or block production-only discovery targets.
4. **Wire into `npm run build`** — artifacts land in deploy output (`public/` pre-build and/or `dist/` post-build). Stale/missing outputs are build failures when checkers exist.
5. **Modular and testable** — one module per artifact + shared `routes.mjs` / `metadata.mjs` orchestrator.

#### Default layout (adapt to repo conventions)

```text
src/lib/discovery/
  metadata.mjs              # shared titles, descriptions, schema, OG fields
  routes.mjs                # canonical route list + resolver
  robots.mjs
  sitemap.mjs
  llms.mjs                  # llms.txt + llms-full.txt
  humans.mjs
  content-api.mjs           # content.json + search index builder
  index.mjs                 # orchestrator (astro hook / postbuild)
public/_headers             # Cloudflare Pages edge headers (see Performance below)
```

Record generator paths and public URLs in `MEMORY.md` under **Discovery Artifacts**.

#### Verification

When a portable operator toolkit is present, run **discovery-doctor** against `dist/` (pre-deploy) and the live URL (post-deploy). Do not ship until the full discovery layer passes.

```bash
node path/to/discovery_doctor/bin/discovery-doctor.mjs ./dist
node path/to/discovery_doctor/bin/discovery-doctor.mjs https://example.com
```

### Brand Guide & visual continuity

Every site project maintains a **project-local Brand Guide** — not inside the portable Web Toolkit.

#### Locate and follow

Before visual design, layout, copy tone, or asset work:

1. Search the **project root** for a brand guide — common paths: `BRAND_GUIDE.md`, `docs/BRAND_GUIDE.md`, `brand/BRAND_GUIDE.md`, or a path recorded in `MEMORY.md` / site profile.
2. If one exists, **follow it explicitly** for colors, typography, logo usage, spacing, voice/tone, photography style, and do/don't rules. Do not override it with generic defaults or model habits.
3. Align `src/styles/tokens.css`, site-profile `branding` blocks, and generated assets with the guide. Document the guide path in `MEMORY.md` under **Brand Guide**.

**Precedence when both exist:** **`BRAND_GUIDE.md` wins** on identity, voice, and visual rules; site-profile `branding` is the **machine-readable execution layer** (OG generation, token defaults). Reconcile conflicts immediately — update the profile to match the guide, not the reverse.

#### Meta, social, and manifest baseline (every site)

From shared layout + Brand Guide + `metadata.mjs`:

- Unique **`<title>`** and **meta description** per page (template + page override).
- **Canonical URL**, **Open Graph**, and **Twitter/X** tags on all indexable pages.
- **Favicon + web app manifest** generated from SVG masters — no defaults (see Assets below).
- Document title/description patterns in the Brand Guide.

#### Create when missing

If no Brand Guide exists and the project has branding work (new site, rebrand, or missing identity artifacts):

1. **Create one** at the project root (or `docs/`) before proceeding with open-ended design — continuity depends on it.
2. Minimum sections: brand purpose, logo/icon paths, color tokens (hex + semantic names), typography stack, voice/tone, imagery rules (SVG vs WebP), favicon/OG requirements, and explicit **no placeholder/default asset** policy.
3. After creation, sync `MEMORY.md` and `tokens.css`; update the guide when brand decisions change in the same work cycle.

When a portable **brand-doctor** (or similar) toolkit is available, use it to audit/generate assets **in service of** the Brand Guide — not as a substitute for documenting project identity.

### Assets, icons, and raster images (no defaults)

**Never ship default, stock, or framework placeholder visuals.**

#### Icons, logos, and UI chrome

- **Do not use** generic favicons, Astro/Vite/Cloudflare default logos, stock hero images, unnamed SVG placeholders, or "temporary" icons left in production.
- **Prefer SVG** for logos, icons, illustrations, and UI marks — crisp at all densities, token-friendly, small over the wire.
- When brand assets are missing: **generate** custom SVG (or toolkit-driven icons/OG images) that match the Brand Guide, **or ask the user** to provide/acquire official assets when trademarks, existing brand books, or client-supplied art apply.
- Raster icon fallbacks (PNG for Apple touch, legacy favicons) may be **generated from SVG masters** at build time — do not hand-pick unrelated PNGs.

#### WebP and responsive imagery

- **Web designs must use WebP dynamically and autonomously** for photographic and raster content — generate WebP at build time (e.g. `sharp`, image-pipeline, or Astro image pipeline configured for WebP output).
- Serve via `<picture>` (WebP + fallback) or equivalent responsive patterns; include width/height to avoid CLS.
- Do not upload uncompressed multi-MB PNG/JPEG heroes when WebP (or AVIF, if adopted in the project) meets quality targets — research current best practice (Section 12).
- Keep **source masters** (SVG for vector; high-quality originals for photos) in repo or documented asset folders; derived WebP/raster sizes are build outputs.

#### Dynamic, wise automation

- Image dimensions, `srcset`, and OG/social crops should derive from metadata and layout breakpoints — not one-off hardcoded paths per page.
- Record asset conventions (master paths, WebP output dirs, icon generation commands) in `MEMORY.md` when introduced.

### Accessibility (a11y)

Treat accessibility as a **launch requirement**, not a polish pass.

- Semantic HTML first (`nav`, `main`, `header`, `footer`, heading hierarchy).
- **Keyboard operable** interactive controls; visible focus states (token-backed).
- **Color contrast** meets WCAG AA against Brand Guide palette — do not rely on color alone for meaning.
- **Alt text** for informative images; decorative images marked appropriately.
- Form inputs with associated **labels** and clear error text.
- Record client-specific a11y expectations in the Brand Guide or `MEMORY.md` when stricter than WCAG AA.

### Performance & edge headers

- Target **Core Web Vitals** best practices: minimal blocking JS, font loading strategy, lazy media, explicit image dimensions (CLS).
- **`public/_headers`** (Cloudflare Pages) or equivalent: **HSTS**, **CSP** (as strict as the stack allows), **`X-Content-Type-Options: nosniff`**, sensible **`Referrer-Policy`**.
- Long-cache **immutable** policy for hashed assets (e.g. `/_astro/*`); short/no-cache for HTML unless SSR caching is intentional.
- Run performance smoke (PageSpeed, site-quality-smoke, or project equivalent) before production deploy when available.

### Site launch workflow (staging → smoke → discovery)

Default order for site changes that affect deploy or public URLs — **dev/staging before production** unless the user explicitly overrides:

| Phase | Action |
|-------|--------|
| **1. Local truth** | Read site profile (if any), `.env`, Brand Guide, `MEMORY.md`; verify toolchain (Section 12). |
| **2. Build** | `npm run check` / `astro check` (if present) → `npm run build` → confirm `dist/` layout. |
| **3. Static gates** | Regenerate discovery layer; run `styles:check` / stylesheet-check when CSS changed. |
| **4. Local discovery pass** | discovery-doctor (or equivalent) against **`./dist`** — fix all failures. |
| **5. Deploy staging/dev** | Deploy to development/staging host first when the project has one. |
| **6. Staging smoke** | site-quality-smoke, preview-smoke, browser-diagnostics, integration-doctor — as scope requires. |
| **7. Deploy production** | Only after staging passes or user waives staging. |
| **8. Production smoke** | Rerun live quality smoke on production host. |
| **9. Live discovery pass** | discovery-doctor against **production URL**; confirm robots/sitemap/llms/APIs/JSON-LD. |
| **10. Record** | Sync `MEMORY.md` (validation run, deploy notes, any infra dry-run/apply audit trail). |

**Infrastructure mutations** (DNS, cache purge, zone harden, robots fix): **audit → dry-run → `--apply`** only when the project provides those gates.

When a portable toolkit is present, prefer its documented **`OPERATIONS.md` / `RUNBOOKS.md`** sequence over ad-hoc deploy steps — but always honor the staging → smoke → discovery pass above.

### Optional portable operator toolkit (if available in project)

Some repos include a portable Web Toolkit or similar diagnostics/deploy CLI. **Only use it when it is actually present** — never assume every project has one.

When available:

- Read that toolkit's local `README.md`, `AGENTS.md`, `OPERATIONS.md`, `RUNBOOKS.md`, and `MEMORY.md` for project-specific commands.
- Prefer site-profile JSON, dry-run/apply gates, and existing CLI entry points over ad-hoc scripts.
- Keep secrets in the target project's root `.env`, not inside toolkit source.
- Before production deploy on client sites: follow **§11 Site launch workflow** (staging → smoke → discovery pass).

When not available:

- Follow the same Astro + Vite + Cloudflare stack rules using the project's own scripts, docs, and `MEMORY.md`.

### Stylesheet architecture (Astro, Tauri web UI, and all web projects)

**Goal:** one source of truth for visual design, no duplicated CSS across components, files small enough for humans and models to edit efficiently (target **≤500 lines per stylesheet**), and class-based styling that keeps `.astro`, `.svelte`, `.vue`, and JSX/TSX files thin.

#### Non-negotiable rules

1. **Do not embed large or repeated CSS** in `.astro`, `.svelte`, `.vue`, or UI component files.
2. **Do not duplicate design values** (colors, spacing, fonts, radii, shadows, breakpoints) — define them once as **CSS custom properties (tokens)** and reference with `var(...)`.
3. **Search existing styles before adding new rules.** Extend or compose existing classes/utilities instead of copying blocks.
4. **Keep each stylesheet at or under ~500 lines.** When a file approaches the limit, split by domain (tokens, layout, component, page) — never grow monolithic `global.css` files.
5. **Prefer external stylesheets + semantic class names** over inline `style=""` attributes except for truly dynamic one-off values (and even then prefer token-backed custom properties).
6. **Record the project's stylesheet map** in `MEMORY.md` when you introduce or reorganize styling (folder paths, naming conventions, which layout imports globals).

#### Default folder model (adapt to repo conventions; do not invent a second parallel system)

Use a segregated tree similar to:

```text
src/styles/
  tokens.css              # design tokens only: color, type, space, radius, shadow, z-index, motion
  base.css                # reset/normalize + element defaults referencing tokens
  global.css              # entry: @import tokens → base → shared layers (imported once from root Layout)
  layout/                 # shell, grid, container, section rhythm
  components/             # one file per component pattern (button, card, nav, form, …)
  pages/                  # page-specific overrides only when not reusable
  utilities/              # small single-purpose helpers (optional; avoid utility sprawl)
```

For **Tauri** (or any desktop shell with a web frontend), apply the same structure to the frontend app (`src/`, `ui/`, etc.). Keep Rust/Cargo code separate from stylesheet organization.

#### Import / ownership rules

- **Single global entry:** root `Layout` (Astro) or app shell imports `global.css` once. Do not re-import globals in every page.
- **Component styles:** live in `src/styles/components/<name>.css`. The component file imports its stylesheet in frontmatter/script, or the layout aggregates known component sheets — match whichever pattern the repo already uses.
- **Page-specific CSS:** only when styles are not reusable; file goes in `src/styles/pages/<page>.css`.
- **Third-party CSS:** isolate overrides in `src/styles/vendor/` or dedicated override files — do not patch vendor rules inside component `<style>` blocks.

#### Allowed inline / scoped exceptions (keep minimal)

Scoped `<style>` in `.astro` / Svelte is allowed **only** when all are true:

- fewer than ~15 lines,
- no token literals (use `var(--token)` if needed),
- not duplicated elsewhere,
- truly local to one component (e.g. one animation keyframe or one layout quirk).

If any exception grows or repeats, **move it to external CSS immediately**.

#### Token-driven theming (dynamic + DRY)

- Define tokens on `:root` (and optional `[data-theme="…"]` or `@media (prefers-color-scheme)`) in `tokens.css`.
- Components reference tokens, not raw hex/px values.
- For dark/light or brand variants, **change tokens**, not individual component rules.
- Document token names in `MEMORY.md` when adding new semantic groups (e.g. `--color-surface-elevated`).

#### Model / token-efficiency workflow

Before writing or editing UI code:

1. Read `tokens.css` + relevant `components/*.css` (not every page file).
2. Reuse existing classes; add new rules in the correct segregated file.
3. Touch the smallest number of CSS files needed for the change.
4. Keep markup in Astro/Svelte/Vue files limited to structure + classes — **no style duplication in the same edit**.
5. After refactors, remove dead CSS from the segregated files (do not leave orphaned rules in component blocks).
6. Run **`stylesheet-check scan --root <project>`** when available in the project (portable operator toolkit) before claiming stylesheet work is complete.

```bash
# If the portable toolkit is present in the project:
node path/to/stylesheet_check/bin/stylesheet-check.mjs scan --root .
# Or, when wired in package.json:
npm run styles:check
```

#### Framework notes

| Stack | Do | Avoid |
|------|----|-------|
| **Astro** | import external CSS in layout/frontmatter; semantic classes in `.astro` markup | large `<style>` blocks; repeating `:root` tokens per page |
| **Svelte** | external CSS or small scoped blocks; `:global()` only in dedicated global files | copying the same scoped block across `.svelte` files |
| **Vue** | external CSS or `<style src="...">` | duplicated `<style scoped>` token literals |
| **Tauri + Vite** | same `src/styles/` segregation in the webview UI | mixing UI styling assumptions into Rust source |
| **React/JSX** | CSS modules or external sheets per component folder | inline style objects duplicating design tokens |

When a project already uses **Tailwind**, `@apply`, CSS Modules, or another system, **follow that system** — but still enforce: no duplicated token literals, split files that exceed ~500 lines, and no repeated ad-hoc CSS in component files bypassing the project's styling layer.

## 12. Version Freshness & Research-First Policy (Critical)

**Never trust model memory for software versions, release names, CLI flags, or API shapes.**

Training data is often years old. Defaulting to remembered versions causes broken installs, deprecated APIs, and rejected deploys. Treat version numbers in model memory as **unverified guesses** until confirmed.

### Mandatory behavior before proposing or pinning versions

1. **Check the repo first**: `package.json`, lockfiles, `.node-version`, `engines`, `wrangler.toml`, optional site/deploy config, and `MEMORY.md` verified resources.
2. **Check authoritative sources second** (web search, registry lookup, or official docs/MCP — not memory):
   - npm registry for Node packages (`astro`, `@astrojs/cloudflare`, `wrangler`, etc.)
   - Node.js release index for runtime baseline
   - Astro docs / changelog for adapter and config changes
   - Cloudflare docs / Workers changelog for Wrangler, Pages, and Workers APIs
   - Rust/Cargo: `crates.io` and `rust-lang.org` release notes when Rust is in scope
3. **Prefer latest stable/current** releases compatible with the project's existing stack unless the user asks to stay pinned.
4. **Document what you verified** in `MEMORY.md` under **Verified Resources & Versions** (package, resolved version, source URL, date checked).
5. **Update local understanding immediately** when verified versions differ from model memory:
   - note breaking changes,
   - note renamed flags/commands,
   - note removed/replaced APIs,
   - adjust commands/config in the same work cycle.

### Delta update rule (memory vs reality)

When research shows newer software than model memory assumed, produce a short internal delta before implementing:

- **Was assumed**: what the model would have defaulted to
- **Verified now**: current version/release and source
- **What changed**: breaking changes, migration steps, new best practice
- **What we will do**: exact pin/bump and file updates

Do not silently proceed with outdated patterns after discovering newer releases.

### Best-practice rule

Derive recommendations from **current official docs + repo state**, not from historical habits. If an old pattern (middleware style, adapter config, Wrangler TOML shape, image pipeline, auth flow) conflicts with current docs, follow the docs and record the decision in `MEMORY.md`.

## 13. Cargo / Rust Build Handling

When a project includes Rust or Cargo (Workers WASM, CLI tools, native helpers, or mixed repos):

1. **Verify toolchain from the repo**: `rust-toolchain.toml`, `Cargo.toml`, `Cargo.lock`, and any WASM/Workers build scripts.
2. **Check latest stable Rust and crate versions** via official sources — do not assume old edition/toolchain defaults.
3. **Use the project's existing build entry points** (`cargo build`, `cargo test`, Wrangler/bundler scripts) before inventing new ones.
4. **For Workers WASM**: confirm whether the repo uses `workers-rs`, `worker-build`, or plain WASM pipelines; match existing conventions.
5. **After build changes**: run the narrowest valid test/build command and record toolchain/version notes in `MEMORY.md`.

If Rust is not present in the repo, do not introduce Cargo unless the user requests it or the Cloudflare task clearly requires it.

## 14. Memory Resource Documentation Rule

When research or verification finds durable version sources, doc pages, migration notes, or platform decisions, sync them to `MEMORY.md`:

- Add/update **Verified Resources & Versions** (URLs, what they are for, last checked date).
- Add/update **Architecture Notes** when Astro/Vite/Cloudflare/Workers patterns change.
- Add/update **Decisions & Conventions** when choosing Workers over external services.
- Add/update **Stylesheet Map** when creating or reorganizing external CSS (token file, global entry, component/page sheet paths).
- Add/update **Brand Guide** when creating, relocating, or materially changing project identity docs.
- Add/update **Discovery Artifacts** when adding/changing robots, sitemap, llms, APIs, JSON-LD, or `_headers` generators.
- Mark stale entries as **superseded** instead of leaving contradictory notes.

## 15. Integrations & compliance (document explicitly)

Do not silently add analytics, forms, auth, payments, or third-party embeds.

- Record chosen providers and env vars in `MEMORY.md` **Decisions & Conventions**.
- Privacy/cookie/legal pages when the site collects data or uses non-essential tracking — scope with the user.
- Prefer **Workers/Pages Functions** for form handlers and webhooks (Section 11 Workers-over-external rule).

`MEMORY.md` is the session-to-session source for verified platform knowledge; `AGENT.md` defines the behavior for maintaining it.

Each project should maintain its own `MEMORY.md` at the project root (or at a subproject root in monorepos). Do not assume a fixed folder layout beyond what exists in the current repo.

---
*Reference this file for all future tasks. Leave every project easier to resume than it was when you opened it.*
