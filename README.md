# Portable Web Toolkit

**Version:** `0.2.0` · **npm package:** `@imyourboyroy/web-toolkit` · **Repo:** [github.com/imyourboyroy/Portable_Web_toolkit](https://github.com/imyourboyroy/Portable_Web_toolkit)

A spec-driven operator toolkit for **Astro + Cloudflare** client sites: audit, scaffold, deploy, discover, and verify — built for humans and coding agents alike.

---

## For humans (60 seconds)

1. **Clone** this repo (or keep one copy on your machine).
2. **Install agent skills** once — so Cursor/Claude/Copilot know how to use the toolkit.
3. **Create client sites in separate folders** — link `Web_Toolkit` via junction/symlink; never build websites inside this repo root.
4. **On each client site:** run `npm run readiness` (or `site-readiness`) before build/deploy.

| You want to… | Do this |
|--------------|---------|
| Install skills for all agents | `./scripts/install-agent-skills.ps1 -Agent all` |
| Check for updates | `node ./scripts/check-toolkit-update.mjs` |
| Update toolkit + skills | `./scripts/update-toolkit.ps1` |
| New client site | Copy [`site-starter/`](./site-starter/README.md) templates |
| Full operator manual | [`Web_Toolkit/README.md`](./Web_Toolkit/README.md) |

---

## For AI agents (zero research)

**Read [`START_HERE.md`](./START_HERE.md) only** — then follow installed skills.

**Every session:**

```text
1. node scripts/check-toolkit-update.mjs  → if update available, run scripts/update-toolkit.ps1
2. site-readiness run --project-root <client-site>
3. Follow output/site-readiness-*.json nextSteps
```

**Install skills (user/global, once):**

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit for all future sessions (user scope). Run scripts/install-agent-skills.ps1 -Agent all on Windows or scripts/install-agent-skills.sh --agent all on macOS/Linux.
```

**Skills:** `portable-web-toolkit` (master) · `site-readiness` · `site-starter` · `toolkit-update` · `instagram-clone`

---

## What this repo is (and is not)

| This repo **is** | This repo **is not** |
|------------------|----------------------|
| Toolkit CLIs under `Web_Toolkit/` | A deployable client website |
| Agent skills under `skills/` | Where client secrets live |
| `site-starter/` copy templates | Your client's `src/` or content |

**Client sites** (e.g. `EmmyBarney/`) are **separate folders** with:

- `package.json`, `src/`, `astro.config.mjs`
- `*.site-profile.json` + `.env` (secrets)
- `Web_Toolkit` → junction to this repo's `Web_Toolkit/`

---

## Repository file tree

```text
Portable_Web_toolkit/
├── START_HERE.md              ← AI: read first (zero research)
├── VERSION                    ← Semver for releases/tags
├── CHANGELOG.md               ← Release notes
├── README.md                  ← You are here
├── AGENTS.md                  ← Repo rules for agents editing toolkit
│
├── skills/                    ← Install into Cursor, Claude, Copilot, etc.
│   ├── portable-web-toolkit/  ← Master skill (full CLI reference)
│   ├── site-readiness/        ← Run-all checks every session
│   ├── site-starter/          ← New client site scaffold
│   ├── toolkit-update/        ← Pull + reinstall skills
│   └── instagram-clone/       ← Public IG gallery (no Meta API)
│
├── site-starter/              ← Copy to NEW client project root
│   ├── workers.package.json   → rename to package.json (Workers/SSR)
│   ├── pages.package.json     → rename to package.json (Pages/static)
│   ├── workers.wrangler.toml
│   ├── pages.wrangler.toml
│   └── scripts/               ← readiness, build-headers, etc.
│
├── scripts/
│   ├── install-agent-skills.* ← Cross-platform skill installer
│   ├── update-toolkit.*       ← git pull + reinstall skills + verify
│   ├── check-toolkit-update.mjs ← Compare local vs GitHub latest tag
│   └── site/                  ← Optional helpers copied into client sites
│
├── docs/agent-skills/         ← Per-agent install guides
│
└── Web_Toolkit/               ← ★ The toolkit product (all CLIs)
    ├── package.json           ← @imyourboyroy/web-toolkit
    ├── OPERATIONS.md          ← Canonical numbered deploy sequence
    ├── RUNBOOKS.md            ← Task-specific flows
    ├── site-profile.schema.json
    ├── site-profiles/         ← Public examples only
    └── <modules>/             ← One folder per CLI (see table below)
```

**Gitignored (never publish):** `Private_Site_Profiles/`, `.env`, `.runtime/`, `smoke-manifest.json`, client secrets.

---

## Toolkit modules (`Web_Toolkit/`)

Each module has `bin/<tool>.mjs` and a `README.md`. Invoke:  
`node ./Web_Toolkit/<module>/bin/<tool>.mjs --help`

### Start here

| Module | CLI | What it does |
|--------|-----|--------------|
| **site_readiness** | `site-readiness` | **Run first** — sandbox-aware run-all; writes `output/site-readiness-*.json` with next steps |
| project_init | `project-init` | Bootstrap README, MEMORY, `.gitignore`, `.env.example` (non-destructive) |
| init_site_profile | `init-site-profile` | Interactive `*.site-profile.json` creator |
| toolkit_report | `toolkit-report` | Fast static readiness snapshot |

### Build, discovery, quality

| Module | CLI | What it does |
|--------|-----|--------------|
| Setup_astro_environment | `astro-env-setup` | Astro/Vite/Wrangler doctor + safe fix |
| discovery_doctor | `discovery-doctor` | Verify robots, sitemap, llms, JSON-LD, APIs |
| stylesheet_check | `stylesheet-check` | External CSS + token policy enforcement |
| site_quality_smoke | `site-quality-smoke` | Live SEO, headers, cache smoke |
| browser_diagnostics | `browser-diagnostics` | Console, network, runtime errors |
| pagespeed_diagnostics | `pagespeed-diagnostics` | Google PageSpeed Insights |
| site_doctor | `site-doctor` | Unified live triage (combines many doctors) |

### Cloudflare & deploy

| Module | CLI | What it does |
|--------|-----|--------------|
| cloudflare-agent-toolkit | `cf-agent` | DNS, WAF, workers, permissions — **dry-run before --apply** |
| headers_deploy | `headers-deploy` | `public/_headers` scaffold + deploy merge |
| cache_purge | `cache-purge` | Targeted edge cache invalidation |
| registrar | `registrar` | Domain NS delegation (e.g. Porkbun → Cloudflare) |
| integration_doctor | `integration-doctor` | `.env` + live API connectivity |

### Content, media, brand

| Module | CLI | What it does |
|--------|-----|--------------|
| instagram_clone | `instagram-clone` | Public IG → `feed.json` + local media (`INSTAGRAM_USERNAME` in client `.env`) |
| brand_doctor | `brand-doctor` | Favicon, OG, meta asset audit |
| image_pipeline | `image-pipeline` | WebP / media rationalization |
| sourcing_doctor | `sourcing-doctor` | WordPress/Wix content extraction |

### Toolkit hygiene

| Module | CLI | What it does |
|--------|-----|--------------|
| toolkit_verify | `toolkit-verify` | Self-validation of toolkit logic |
| privacy_check | `privacy-check` | Scan for secrets before publish |
| toolkit_purge | `toolkit-purge` | Remove runtime residue before export |
| junk_purge | `junk-purge` | Clean client project build junk |

---

## Quick start

### Install agent skills (once)

**Windows (PowerShell 7+):**

```powershell
git clone https://github.com/imyourboyroy/Portable_Web_toolkit.git
cd Portable_Web_toolkit
./scripts/install-agent-skills.ps1 -Agent all
```

**macOS / Linux:**

```bash
git clone https://github.com/imyourboyroy/Portable_Web_toolkit.git
cd Portable_Web_toolkit
chmod +x ./scripts/install-agent-skills.sh
./scripts/install-agent-skills.sh --agent all
```

### Check & update

```powershell
node ./scripts/check-toolkit-update.mjs   # exit 2 = update available
./scripts/update-toolkit.ps1              # pull + reinstall skills + verify
```

### Verify toolkit health

```powershell
cd Web_Toolkit
node ./toolkit_verify/bin/toolkit-verify.mjs
node ./privacy_check/bin/privacy-check.mjs scan --root . --json
```

### New client site

See [`site-starter/README.md`](./site-starter/README.md) — copy `workers.package.json` or `pages.package.json`, junction `Web_Toolkit`, run `site-readiness --apply-safe-fixes`.

### Existing client site (every session)

```powershell
cd <client-project>
npm run readiness
# read output/site-readiness-*.json
```

---

## Configuration model

| Data | Where |
|------|-------|
| API tokens, account IDs | Client `.env` (never commit) |
| Domains, worker names, deploy commands | `*.site-profile.json` |
| Brand voice, colors, logos | Client `BRAND_GUIDE.md` |
| Toolkit defaults (optional) | `Web_Toolkit/.env.example` only |

**Deploy targets:** `workers` (SSR + `@astrojs/cloudflare`) or `pages` (static) — must match `site-starter` template choice.

---

## Hard rules (toolkit contract)

- **Custom discovery only** — never `@astrojs/sitemap` / `@astrojs/robots`
- **Dry-run first** — cf-agent, registrar, cache purge, zone harden
- **Staging → smoke → production** — unless operator waives
- **No client-specific data** in tracked toolkit source

---

## Releases & tags

Releases use semver tags: `v0.2.0`, `v0.2.1`, …  
See [`CHANGELOG.md`](./CHANGELOG.md).

```powershell
git fetch --tags
node ./scripts/check-toolkit-update.mjs
```

---

## Documentation map

| Doc | Audience |
|-----|----------|
| [`START_HERE.md`](./START_HERE.md) | AI agents — zero research |
| [`AGENTS.md`](./AGENTS.md) | Agents editing toolkit source |
| [`Web_Toolkit/OPERATIONS.md`](./Web_Toolkit/OPERATIONS.md) | Full deploy sequence |
| [`docs/agent-skills/`](./docs/agent-skills/README.md) | Per-platform skill install |

---

## Author

**Roy Dawson IV** · [@imyourboyroy](https://github.com/imyourboyroy)

Toolkit author metadata in packages identifies the **tool author**. Client names, domains, and branding belong in each project's site profile and `.env` — not in this repository.
