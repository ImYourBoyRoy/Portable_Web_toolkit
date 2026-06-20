# Setup Astro Environment

Use this tool before previewing, auditing, deploying, or mutating a Cloudflare-backed Astro site.

## Commands

- `astro-env-setup doctor --project-root <path> --site-profile <profile>`
- `astro-env-setup fix --project-root <path> --site-profile <profile>`
- `astro-env-setup verify --project-root <path> --site-profile <profile>`
- `astro-env-setup prepare-project --project-root <path> --site-profile <profile>`
- `astro-env-setup preview --project-root <path> --site-profile <profile>`
- `astro-env-setup preview-smoke --project-root <path> --site-profile <profile>`

## What it checks

- Node / npm / npx availability
- package manager detection from lockfiles
- `node_modules` presence
- Astro / TypeScript / Wrangler / Cloudflare adapter dependencies
- `astro.config.*` presence
- `package.json` scripts
- `wrangler.toml` presence
- `.env.example` presence
- optional site-profile linkage
- check/build/test commands during verify/prepare

## Preview support

`preview` prefers:
1. `commands.preview` from the site profile
2. `npm run preview`
3. `npm run dev`

This is intended to let you browse the site locally before publishing.
For Cloudflare-adapter projects where `astro preview` is unsupported, the tool automatically falls back to `npm run dev` when possible.

`preview-smoke` launches preview on a local host/port, probes it, writes logs/reports into the target project's `output/` folder, and then shuts the preview server down automatically.

## Secret source preference

- use the target project's root `.env` for live site secrets and analytics config
- use portable `.env` only for machine-wide defaults or operator convenience

## Safety

- `doctor` is read-only.
- `fix` only performs safe project remediations like dependency install and `.env.example` creation.
- `verify` runs validation commands.
- `prepare-project` runs `fix` then `verify`.
- `preview` launches the local server and keeps it attached until you stop it.
- `preview-smoke` is read-only beyond local preview logs/reports.
