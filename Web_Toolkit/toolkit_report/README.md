# Toolkit Report

Generates a quick readiness snapshot for a target project plus the portable toolkit.

## Commands

- `toolkit-report generate --project-root <path>`
- `toolkit-report generate --site-profile <profile> --project-root <path>`
- `toolkit-report generate --site-profile <profile> --project-root <path> --cloudflare`

## What it summarizes

- canonical portable docs present or missing
- core portable tools present or missing
- target project readiness (`package.json`, Astro config, dependencies, env files)
- deploy/profile readiness
- pending next steps
- optional read-only Cloudflare check results
