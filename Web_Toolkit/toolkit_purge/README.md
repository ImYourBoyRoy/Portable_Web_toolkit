# Toolkit Purge

Use this to clean deletable runtime artifacts from the portable toolkit itself.

## Command

- `toolkit-purge`
- `toolkit-purge --apply`

## What it removes

- portable runtime state under `.runtime/`
- legacy `dist/` and `output/` folders inside `Web_Toolkit/`
- legacy Cloudflare toolkit `dist/`, `output/`, `.cf-agent/`, and `doctor.txt`
- Python `__pycache__` folders and `.pyc` files

Dry-run is the default.

