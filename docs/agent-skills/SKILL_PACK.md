# Agent skills pack overview

> **Canonical index:** [`SKILL_INDEX.md`](./SKILL_INDEX.md)  
> **Authoritative inventory:** root [`skill-pack.json`](../../skill-pack.json)

This file is a short overview. Prefer `SKILL_INDEX.md` for selection criteria and symlink recipes.

## Core (project-scoped unless noted)

| Skill | Purpose |
|---|---|
| `portable-web-toolkit-router` | Global default: inspect needs and link project skills |
| `portable-web-toolkit` | Route toolkit-managed Astro + Cloudflare work |
| `site-onboarding` | Staged hand-holding S0–S9 |
| `site-starter` | Scaffold from approved templates |
| `site-readiness` | Readiness evidence and next actions |
| `site-maintenance` | Healthy ops loop (`HOW_TO.md`) |
| `wcag-auditor` | A11y evidence via bundled `Web_Toolkit/wcag_auditor` |
| `pagespeed-diagnostics` | Google PSI via toolkit CLI |
| `discovery-doctor` | Discovery layer on `dist` or live URL (fail-closed) |
| `toolkit-update` | Compare and reconcile toolkit/skill versions |

## Optional

| Skill | Purpose |
|---|---|
| `brand-doctor` | Brand / favicon / OG assets |
| `image-pipeline` | Raster → WebP rationalization |
| `instagram-clone` | Public-profile static gallery fallback |
| `vectorize-pipeline` | SVG candidates from fonts/rasters |

## Typical project link recipes

```bash
# Default = light router only (install_by_default)
node ./scripts/manage-project-skills.mjs link --project <client-site-dir>

# Active website / maintenance work
node ./scripts/manage-project-skills.mjs link --project <client-site-dir> \
  --skills site-onboarding,portable-web-toolkit,site-readiness,site-starter,site-maintenance,wcag-auditor,pagespeed-diagnostics,discovery-doctor,toolkit-update
```

## Inspect and validate

```bash
node ./scripts/validate-skills.mjs
node ./scripts/check-agent-skills.mjs --agent cursor --scope user
```

Cross-platform notes: [`CROSS_PLATFORM.md`](./CROSS_PLATFORM.md). Install protocol: [`INSTALL_PROTOCOL.md`](./INSTALL_PROTOCOL.md).
