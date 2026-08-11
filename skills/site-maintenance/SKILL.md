---
name: site-maintenance
description: Run the Portable Web Toolkit healthy maintenance loop: package refresh, local cache purge, build/smoke, media/fonts/legal/cookies pass, staging then production deploy, remote cache purge and warm, PageSpeed, and safe fixes. Use checkpoints before deploy or Cloudflare --apply. Read HOW_TO.md.
---

# Site Maintenance

Follow repository `HOW_TO.md` (full maintenance loop) and `Web_Toolkit/OPERATIONS.md`.

## Default order (checkpoints)

1. Update local agent environment if needed (ask before privileged installs).
2. `package-updater` on client `package.json` (runs `npx @astrojs/upgrade` for Astro sites; TypeScript stays on ^6.x) → approve → `npm install`.
3. Local cache purge → `check` → `build` → `discovery-doctor`.
4. Media / fonts / legal / cookies (HOW_TO §8): prefer WebP/AVIF/SVG, self-hosted fonts, legal page, cookies notice when analytics are on.
5. Local / staging smoke.
6. Explicit OK → production deploy (`headers-deploy write-deploy` as required).
7. Targeted remote cache purge (dry-run → apply) → warm key production URLs.
8. PageSpeed both strategies → minimal CWV fix plan → approve → re-measure.

## Rules

1. Dry-run Cloudflare mutations before `--apply`.
2. Prefer staging before production.
3. Never commit secrets.
4. Prefer toolkit CLIs; record outcomes in client `MEMORY.md`.
5. Flag poorly rendered images; convert on-page JPG/PNG via image-pipeline when WebP/AVIF fits.
