# Privacy Check

Use this before sharing or exporting the toolkit.

## Command

- `privacy-check scan --root <path>`

## What it flags

- tokens / API keys
- email addresses
- absolute user paths
- site-specific domain leftovers
- audit artifact filenames

The goal is not perfect secret detection — it is a strong pre-share sanity check.

Recommended flow:

1. export the toolkit to a clean folder
2. run `privacy-check scan --root <export-folder>`
3. fix findings
4. zip/share only after the scan is clean
