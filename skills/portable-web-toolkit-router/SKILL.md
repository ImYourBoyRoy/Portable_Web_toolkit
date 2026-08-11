---
name: portable-web-toolkit-router
description: Dynamic router for Portable Web Toolkit. Inspects project needs and symlinks required agent skills into project scope (.agents/skills/). Use when starting or working on web design, Astro, or Cloudflare projects across Cursor, Claude Code, Codex, Antigravity, Copilot, etc.
---

# Portable Web Toolkit Router

Use this skill when initializing or managing skills for an Astro + Cloudflare web design project using the Portable Web Toolkit.

**Canonical skill home:** `<Portable_Web_toolkit_install>/skills/` (resolve via linked `Web_Toolkit/..`, `portable-web-toolkit root`, or `~/.portable-web-toolkit` stamp). Symlink from that install into the client `.agents/skills/` — never copy skill trees into global agent homes except this router.

Only this router is `install_by_default` / globally installed.

## Route first

| Need | Skill |
|---|---|
| New machine, Cloudflare beginner, guided setup | `site-onboarding` → `docs/agent-skills/ONBOARDING_STAGES.md` |
| New site scaffold only (already onboarded) | `site-starter` (ask Workers vs Pages first) |
| Readiness / gates | `site-readiness` |
| Deploy / Cloudflare ops | `portable-web-toolkit` |
| Full upgrade → smoke → deploy → purge → warm → PSI | `site-maintenance` → `HOW_TO.md` |
| Accessibility evidence | `wcag-auditor` → `Web_Toolkit/wcag_auditor` only (never `AI/`) |
| PageSpeed Insights | `pagespeed-diagnostics` |
| Discovery layer (robots/sitemap/llms) | `discovery-doctor` |
| Brand / favicon / OG | `brand-doctor` |
| Raster → WebP | `image-pipeline` |
| Toolkit freshness | `toolkit-update` |
| Instagram gallery | `instagram-clone` |
| SVG wordmark recovery | `vectorize-pipeline` |

## Operational Sequence

1. **Check Project Scope**: Verify if `.agents/skills/` exists in the active project workspace root.
2. **Resolve toolkit install**: Find `Portable_Web_toolkit` root; skills live at `skills/` there (`skill-pack.json`).
3. **Inspect Skill Index**: Read `docs/agent-skills/SKILL_INDEX.md`.
4. **Symlink Selected Skills** with `manage-project-skills.mjs` (always pass `--skills` for non-router skills):

   ```bash
   node <path-to-Portable_Web_toolkit>/scripts/manage-project-skills.mjs link --project . \
     --skills site-onboarding,portable-web-toolkit,site-readiness,wcag-auditor,pagespeed-diagnostics,site-maintenance,discovery-doctor
   ```

5. **Verify**: `manage-project-skills.mjs status --project .`
