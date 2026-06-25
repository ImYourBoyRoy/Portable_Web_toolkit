# START HERE — AI agents (zero research)

**Repo:** [Portable_Web_toolkit](https://github.com/imyourboyroy/Portable_Web_toolkit)  
**Purpose:** Operate Astro + Cloudflare client sites with spec-driven CLIs and skills.

Read this file only. You do not need to explore the repo to begin.

---

## 1. Install skills (once per machine)

Tell any coding agent:

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit for all future sessions (user/global scope). Run scripts/install-agent-skills.ps1 -Agent all on Windows (PowerShell 7+) or scripts/install-agent-skills.sh --agent all on macOS/Linux.
```

## 1b. Check for updates (every session)

```powershell
node ./scripts/check-toolkit-update.mjs
# exit 2 → run ./scripts/update-toolkit.ps1
```

**Skills installed:**

| Skill | Use when |
|-------|----------|
| `portable-web-toolkit` | Default — any Astro/Cloudflare client site work |
| `site-starter` | Brand-new client project from scratch |
| `site-readiness` | Run-all checks + what's missing (start every session) |
| `toolkit-update` | Pull latest toolkit + reinstall skills |
| `instagram-clone` | Public Instagram gallery (no Meta API) |

---

## 2. Two repos, two roles (do not confuse)

| What | Path | Role |
|------|------|------|
| **Toolkit distribution** | `Portable_Web_toolkit/` | CLIs, skills, `site-starter/` templates — publish to GitHub |
| **Client site** | e.g. `EmmyBarney/` | Real website: `src/`, `package.json`, `.env`, `*.site-profile.json` |

**Client site links toolkit:**

```powershell
cmd /c mklink /J Web_Toolkit C:\path\to\Portable_Web_toolkit\Web_Toolkit
```

macOS/Linux: `ln -s /path/to/Portable_Web_toolkit/Web_Toolkit ./Web_Toolkit`

Junction may be named `web_toolkit` (lowercase) — scripts must match.

---

## 3. First command on any client site (always)

```powershell
cd <client-project-root>
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root . --site-profile ./<site>.site-profile.json
```

Or: `npm run readiness` (if site-starter scripts were copied).

Read `output/site-readiness-*.json` — PASS/WARN/FAIL/SKIP and **next steps**.

Safe auto-fix missing starter files:

```powershell
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root . --apply-safe-fixes
```

---

## 4. New client site (from zero)

Follow **`site-starter` skill** or `site-starter/README.md`:

1. Create folder **outside** toolkit repo
2. Copy `site-starter/workers.package.json` **OR** `pages.package.json` → `package.json`
3. Copy matching wrangler template → `wrangler.toml`
4. Copy `site-starter/scripts/` and `.env.example`
5. Junction `Web_Toolkit`
6. `npm install` → `init-site-profile` → `site-readiness --apply-safe-fixes`

| Deploy | `deployTarget` | Astro | Package template |
|--------|----------------|-------|------------------|
| **Workers** | `workers` | `output: 'server'` + `@astrojs/cloudflare` | `workers.package.json` |
| **Pages** | `pages` | `output: 'static'` | `pages.package.json` |

---

## 5. Secrets and config

| Data | Where | Never |
|------|-------|-------|
| API tokens | **Client** `.env` | Git / toolkit `.env` |
| Deploy config | `*.site-profile.json` | Hardcoded in toolkit |
| Operator lists | `smoke-manifest.json` (gitignored) | Tracked source |

---

## 6. Canonical workflow

```
site-readiness → check → build → discovery-doctor ./dist
  → staging deploy → smoke → prod → discovery-doctor <live-url>
```

**Discovery:** custom generators only — never `@astrojs/sitemap` / `@astrojs/robots`.  
**Cloudflare:** audit → dry-run → `--apply`.

---

## 7. CLI quick reference (`Web_Toolkit/`)

| CLI | Use |
|-----|-----|
| `site-readiness` | **Start here** |
| `project-init` | Bootstrap starter files |
| `init-site-profile` | Create site profile |
| `site-doctor` | Live triage |
| `discovery-doctor` | Discovery layer verify |
| `cf-agent` | Cloudflare audit/deploy |
| `instagram-clone` | Public IG gallery |
| `toolkit-verify` | Toolkit self-check |

Full list: `skills/portable-web-toolkit/SKILL.md`

---

## 8. Decision tree

```
New folder?        → site-starter
Existing client?   → site-readiness (first)
Instagram gallery? → instagram-clone
Deploy / CF?       → portable-web-toolkit
Live site broken?  → site-doctor
Update toolkit?    → toolkit-update
```

---

## 9. Instruction precedence

1. User request  
2. Installed **skills**  
3. Client `BRAND_GUIDE.md` + site profile + `.env`  
4. This file → `AGENTS.md` → `OPERATIONS.md`

**Ignore:** `Web_Toolkit/AGENT.md` (deprecated).
