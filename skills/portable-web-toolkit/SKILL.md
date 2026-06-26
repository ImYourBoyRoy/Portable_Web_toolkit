---
name: portable-web-toolkit
description: Master skill for the Portable Astro + Cloudflare Web Toolkit. Use for ANY client site work — new sites, deploy, discovery, cf-agent, site-readiness, site-doctor, branding, smoke tests. If you only load one skill, load this. Blind agents start with site-readiness run, then follow this skill.
---

# Portable Web Toolkit (master skill)

**Zero-research entry:** repo `START_HERE.md` at root.  
**Cross-platform:** all CLIs are Node — see `skills/CROSS_PLATFORM.md`.

## Session start (mandatory)

```bash
# Toolkit repo — check for updates
node ./scripts/check-toolkit-update.mjs
# exit 2 → node ./scripts/update-toolkit.mjs

# Client site — readiness first (always)
cd <client-project-root>
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root . --site-profile ./<site>.site-profile.json
```

Read `output/site-readiness-*.json` → execute `nextSteps` and `recommendedFixes`.

## Architecture (memorize)

```
Portable_Web_toolkit/          ← toolkit GitHub repo (NOT a website)
  START_HERE.md
  Web_Toolkit/                 ← all CLIs live here
  site-starter/                ← copy for NEW client sites
  skills/

ClientSite/                    ← separate folder per client
  package.json, src/, .env
  *.site-profile.json
  Web_Toolkit/ → junction/symlink to Portable_Web_toolkit/Web_Toolkit
  output/                      ← reports (readiness, site-doctor, etc.)
```

| Concept | Location |
|---------|----------|
| Secrets | Client `.env` only |
| Deploy spec | `*.site-profile.json` |
| Toolkit code | `Web_Toolkit/` link (junction or symlink) |
| Never commit | `.env`, `Private_Site_Profiles/`, `smoke-manifest.json` |

## Skill routing

| Situation | Skill |
|-----------|-------|
| New empty client folder | **site-starter** |
| Any existing client session start | **site-readiness** |
| Instagram gallery | **instagram-clone** |
| Pull latest toolkit/skills | **toolkit-update** |
| Everything else | **this skill** |

## Full CLI reference

Path pattern: `node ./Web_Toolkit/<module>/bin/<cli>.mjs <command> --help`

| CLI | Command | Purpose |
|-----|---------|---------|
| **site-readiness** | `run` | **Start here** — run-all + next steps |
| project-init | `audit` / `apply-safe` | Bootstrap README/MEMORY/.gitignore |
| init-site-profile | (interactive) | Create `*.site-profile.json` |
| toolkit-report | `generate` | Fast static snapshot |
| site-doctor | `run` | Live triage: browser, smoke, CF |
| discovery-doctor | `<dist-or-url>` | robots/sitemap/llms/JSON-LD |
| cf-agent | `permissions audit`, `site audit`, `dns audit`, `rules audit`, `workers verify`, `site harden` | Cloudflare — dry-run before `--apply` |
| headers-deploy | `scaffold-public`, `write-deploy`, `audit` | `public/_headers` |
| site-quality-smoke | `run` | Live headers/SEO/cache |
| integration-doctor | `run` | `.env` + API connectivity |
| browser-diagnostics | `run` | Console/network/runtime |
| brand-doctor | `audit` | Favicon, OG, meta assets |
| instagram-clone | `clone` / `audit` | Public IG → feed.json |
| stylesheet-check | `scan --root <project>` | CSS policy |
| image-pipeline | various | WebP / media rationalization |
| sourcing-doctor | various | WordPress/Wix extraction |
| cache-purge | various | Edge purge — dry-run first |
| pagespeed-diagnostics | `run`, `agent-batch` | Google PSI |
| toolkit-verify | (default) | Toolkit self-check |
| privacy-check | `scan --root .` | Secrets before publish |
| toolkit-purge | `--apply` | Clean before export |
| junk-purge | various | Client project cache cleanup |

## Site profile (required for deploy)

Pass always: `--site-profile ./<name>.site-profile.json`

Minimum fields:

```json
{
  "siteId": "my-site",
  "deployTarget": "workers",
  "hosts": { "production": ["example.workers.dev"] },
  "commands": {
    "build": "npm run build",
    "deploy": { "production": "npm run cf:deploy" }
  },
  "cloudflare": {
    "workerNames": { "production": "my-site", "development": "my-site-dev" }
  }
}
```

Pages sites: `"deployTarget": "pages"` + `cloudflare.pagesProject`.

## Build and deploy sequence

```bash
# 1. Readiness
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root .

# 2. Static gates
npm run check
npm run build
node ./Web_Toolkit/stylesheet_check/bin/stylesheet-check.mjs scan --root .

# 3. Discovery (Workers: ./dist/client | Pages: ./dist)
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist/client

# 4. Headers before deploy
node ./Web_Toolkit/headers_deploy/bin/headers-deploy.mjs write-deploy --project-root . --environment production

# 5. CF audits (dry-run)
node ./Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs permissions audit --site-profile <profile>
node ./Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs site audit --site-profile <profile>

# 6. Deploy (from client package.json / profile)
npm run cf:deploy

# 7. Post-deploy
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs https://<production-host>
node ./Web_Toolkit/site_quality_smoke/bin/site-quality-smoke.mjs run --site-profile <profile>
```

**Order:** staging/dev → smoke → production → live discovery. Never skip unless user waives.

## Discovery layer (non-negotiable)

Generate on every build — **custom generators only**:

- `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `humans.txt`
- `/.well-known/security.txt`, `/api/content.json`, `/api/search.json`
- JSON-LD in layout (`WebSite`, `Person`/`Organization`, `BreadcrumbList`)

**Never** use `@astrojs/sitemap` or `@astrojs/robots`.

## Hard rules

| Rule | Detail |
|------|--------|
| Spec-driven | Read site profile before deploy/DNS/branding |
| Dry-run first | cf-agent, registrar, cache purge, zone harden |
| Secrets | Client `.env` only — never toolkit tree or git |
| Brand | Read client `BRAND_GUIDE.md` before visual/copy |
| Styles | External CSS in `src/styles/tokens.css`; ≤~500 lines/file |
| Assets | No stock favicons/heroes; SVG + WebP |
| Workers-first | Prefer CF Workers/KV/D1/R2 over external SaaS |
| Versions | Verify Astro/Wrangler/Node from repo — not model memory |
| Do not load | `docs/templates/AGENT.template.md` for toolkit work |

## Environment variables (client `.env`)

```env
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
INSTAGRAM_USERNAME=          # optional
INSTAGRAM_CLONE_LIMIT=24
PUBLIC_SITE_URL=             # optional override
```

## Sandbox behavior

In sandbox/offline: use `site-readiness --skip-network`. Skip live smoke, integration, cf-agent API calls. Local build + discovery on `dist/` still valid.

## Live site broken?

```bash
node ./Web_Toolkit/site_doctor/bin/site-doctor.mjs run --site-profile <profile>
```

Skip flags: `--skip-cloudflare`, `--skip-browser-diagnostics`, `--skip-quality-smoke`.

## Publishing toolkit to GitHub

```bash
node ./Web_Toolkit/toolkit_purge/bin/toolkit-purge.mjs --apply
node ./Web_Toolkit/privacy_check/bin/privacy-check.mjs scan --root ./Web_Toolkit --json
node ./Web_Toolkit/toolkit_verify/bin/toolkit-verify.mjs
```

## Install / update skills (agent handles this)

```text
Install the Portable Web Toolkit agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit for all future sessions (user/global scope).
```

```bash
node ./scripts/install-agent-skills.mjs
node ./scripts/update-toolkit.mjs
```

Do **not** ask end users to run manual one-shot git clone install flows unless they prefer to.

## Machine setup (user runs — admin/sudo)

Direct the user to the interactive wizard when host tools are missing:

| OS | `Setup_Agent_Environment.bat` / `.command` / `.sh` |

Core includes **pyenv-native** (Rust Python manager — Windows, macOS, Linux). User opts in/out of optional tools in the wizard.

See **toolkit-update** skill for pull + reinstall flow.

## Verification checklist

- [ ] `site-readiness` pass or only acceptable warnings
- [ ] Site profile honored
- [ ] `discovery-doctor` pass on `dist/` and live URL
- [ ] Staging smoke before production
- [ ] No secrets in git
- [ ] Client `MEMORY.md` updated when versions/deploy change (not toolkit operator MEMORY)

## Rationalizations (reject these)

| Excuse | Reality |
|--------|---------|
| Skip readiness | You will guess wrong — run it |
| Astro sitemap integration | Violates contract |
| Secrets in toolkit `.env` | Client project only |
| cf-agent apply without audit | Always dry-run first |
| Toolkit repo = website | Separate client folder + Web_Toolkit link |
