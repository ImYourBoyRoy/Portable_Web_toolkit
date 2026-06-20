# Performance Fixes

Low-risk source-level remediation helpers for issues discovered by:

- `site_quality_smoke`
- `browser_diagnostics`
- `pagespeed_diagnostics`
- `site_doctor`

## Commands

```bash
node ./bin/performance-fixes.mjs recommend --site-profile ../site-profiles/example-workers.json
node ./bin/performance-fixes.mjs immutable-cache --project-root /path/to/project --apply
```

## Current scope

- recommend next remediation commands from the latest reports
- add/update `public/_headers` so hashed `/_astro/*` assets can use a long-lived immutable cache policy
