# Toolkit Verify

Runs a lightweight self-verification pass for the portable toolkit.

## Commands

- `toolkit-verify`
- `toolkit-verify --site-profile <profile> --project-root <path>`
- `toolkit-verify --site-profile <profile> --project-root <path> --cloudflare`

## What it checks

- core CLI entrypoints
- project-aware doctor/dry-run flows when a profile is supplied
- sanitized export + privacy scan
- optional live read-only Cloudflare audits
