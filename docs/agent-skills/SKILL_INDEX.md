# Agent Skills Index — Portable Web Toolkit

This index is the fast-lookup manifest used by AI coding agents (**Antigravity, Cursor, Claude Code, Codex, Copilot, etc.**) to inspect available skills and symlink only the necessary skills into a client project's `.agents/skills/` directory.

**Canonical sources:** `<Portable_Web_toolkit_install>/skills/` (see `skill-pack.json`).  
**Global install:** only `portable-web-toolkit-router`. Everything else is project-scoped via symlink.

---

## Skill Selection Matrix

| Skill Name | Tier | Purpose & Selection Criteria | Primary Use-Case | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **`portable-web-toolkit-router`** | `core` | **Minimalist Router** (global): inspects needs and links project skills from the toolkit install `skills/` tree. | Initializing skills in a project workspace. | None |
| **`portable-web-toolkit`** | `core` | **Master Workflow Router**: Cloudflare contracts, site profile ops, build/deploy workflow. | Any Astro + Cloudflare project managed by the toolkit. | None |
| **`site-onboarding`** | `core` | **Staged hand-holding** S0–S9 (`ONBOARDING_STAGES.md`). | New machine, Cloudflare beginners, brand-new sites. | None |
| **`site-starter`** | `core` | **Site Scaffolding** from `site-starter/` templates. | New client site (after Workers vs Pages). | None |
| **`site-readiness`** | `core` | **Auditing & Gates**: readiness, discovery hooks, build gates. | Pre-flight before build/staging/deploy. | `portable-web-toolkit` |
| **`site-maintenance`** | `core` | **Healthy ops loop**: packages → smoke → deploy → purge → warm → PSI (`HOW_TO.md`). | Recurring site maintenance days. | `portable-web-toolkit` |
| **`wcag-auditor`** | `core` | **Accessibility evidence**: bundled `Web_Toolkit/wcag_auditor` + Playwright Chromium. Never `AI/`. | A11y evidence gate on toolkit sites. | None |
| **`pagespeed-diagnostics`** | `core` | **Google PSI** via toolkit CLI (`GOOGLE_PAGESPEED_API_KEY`). | CWV / PSI after deploy or in maintenance. | None |
| **`discovery-doctor`** | `core` | **Discovery layer** robots/sitemap/llms/JSON-LD on `dist` or live URL. | Pre-deploy and post-prod discovery pass. | None |
| **`toolkit-update`** | `core` | **Reconciliation & Version Sync**. | Upgrading toolkit health. | None |
| **`brand-doctor`** | `optional` | **Brand / favicon / OG** assets per Brand Guide. | Branding and social preview assets. | None |
| **`image-pipeline`** | `optional` | **WebP / media** rationalization. | Photographic/raster optimization. | None |
| **`instagram-clone`** | `optional` | **Static Instagram gallery** fallback. | Public IG gallery without Meta API. | `portable-web-toolkit` |
| **`vectorize-pipeline`** | `optional` | **SVG candidate prep** from fonts/rasters. | Logo & vector asset preparation. | None |

---

## Universal Symlink Symbiosis (`.agents/skills/`)

```bash
# Default link = only the light router (install_by_default=true)
node /path/to/Portable_Web_toolkit/scripts/manage-project-skills.mjs link --project /path/to/client-site

# Typical active site work
node /path/to/Portable_Web_toolkit/scripts/manage-project-skills.mjs link --project /path/to/client-site \
  --skills portable-web-toolkit,site-readiness,site-maintenance,wcag-auditor,pagespeed-diagnostics,discovery-doctor,toolkit-update

# Status
node /path/to/Portable_Web_toolkit/scripts/manage-project-skills.mjs status --project /path/to/client-site
```

### Why Symlinks?
1. **Zero Context Waste**: Unrelated projects do not load web skills globally.
2. **Instant Live Updates**: `git pull` in `Portable_Web_toolkit` updates all linked clients.
3. **Cross-Platform**: POSIX symlinks / Windows Directory Junctions.
