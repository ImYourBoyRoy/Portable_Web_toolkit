# Headers Deploy

Cloudflare **`_headers`** tooling for Astro + Cloudflare sites in the portable Web Toolkit.

## What it covers

| Layer | Command | Purpose |
|-------|---------|---------|
| Source cache baseline | `scaffold-public` | Managed `public/_headers` cache rules (`/_astro/*`, fonts, HTML, OG image) |
| Deploy security merge | `write-deploy` | Injects CSP, HSTS, nosniff, COOP, referrer, permissions + merges `public/_headers` into `dist/` |
| Audit | `audit` | Verifies public baseline and built deploy headers |
| Full stack guide | `stack` | Prints recommended Cloudflare enhancement sequence |

## Site profile configuration

Add to `cloudflare.headers` in your site profile:

```json
"cloudflare": {
  "headers": {
    "distSubdir": "client",
    "preset": "astro-static",
    "developmentNoIndex": true,
    "ogImagePath": "/assets/og-image.png",
    "csp": {
      "directives": {
        "connect-src": ["'self'", "https://static.cloudflareinsights.com"]
      }
    }
  }
}
```

### CSP presets

- **`astro-static`** — self-hosted fonts, Cloudflare Web Analytics, blob/data images (default)
- **`astro-analytics`** — adds GA4 + PostHog + Google Fonts allowances (pairs with `cf-agent analytics scaffold)

## Typical workflow

```powershell
headers-deploy scaffold-public --site-profile <profile>
headers-deploy scaffold-public --site-profile <profile> --apply
npm run build
headers-deploy write-deploy --site-profile <profile> --environment production
headers-deploy write-deploy --site-profile <profile> --environment production --apply
discovery-doctor ./dist
cf-agent site harden --site-profile <profile>
cf-agent site harden --site-profile <profile> --apply
site-quality-smoke run --site-profile <profile>
```

Run `headers-deploy stack` for the full ordered checklist including zone hardening, rules audit, cache purge, and live smoke.

## Pair with

- `performance-fixes immutable-cache` — legacy helper; prefer `scaffold-public` for new sites
- `cf-agent site harden` — zone-level HTTPS/TLS/HSTS/brotli/HTTP3 settings
- `discovery-doctor` — build-time discovery + header verification
- `site-quality-smoke` — live CSP/HSTS/route verification

## Safety defaults

Both `scaffold-public` and `write-deploy` are dry-run unless `--apply` is passed. Preview first, then apply.
