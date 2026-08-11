# Init Site Profile

Agent-facing helper to create a **client** `*.site-profile.json` after an intake interview.

This is **not** a GUI wizard. The coding model gathers answers, proposes names, then runs `create`.

## Where profiles live

| Location | Purpose |
|----------|---------|
| **`<client-project>/<siteId>.site-profile.json`** | Default for real sites (correct) |
| `Web_Toolkit/site-profiles/example-*.json` | Public examples only — do **not** put live clients here |

`site-readiness` auto-discovers a single `*.site-profile.json` in the client project root. Other tools take `--site-profile <path>`.

## Commands

```bash
# From a linked client project (preferred):
node ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs requirements
node ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs requirements --json

node ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs create \
  --site-id bakery \
  --project-root . \
  --deploy-target workers \
  --zone bakery.com \
  --prod-hosts bakery.com,www.bakery.com \
  --dev-hosts staging.bakery.com \
  --registrar namecheap \
  --dns-provider cloudflare \
  --worker-prod bakery-web
```

Default output: **`<project-root>/<site-id>.site-profile.json`** with `"projectRoot": "."`.

## Agent protocol

1. Run `requirements` (or `requirements --json`) — do not invent a parallel checklist.
2. Interview using `Web_Toolkit/CHECKLIST.md` + onboarding S5. **Propose** `siteId`, worker/pages names, and hosts from the domain; challenge vague names (`site`, `test`, `new-project`).
3. Create with all **required** flags. Fill optional flags when known.
4. Tell the user the output path. Use that path as `--site-profile` for readiness / cf-agent.
5. Keep secrets in project `.env` (sections A–D from `site-starter/.env.example`) — never in the profile JSON.

## Required flags

- `--site-id`
- `--project-root`
- `--deploy-target` (`workers` | `pages`)
- `--zone`
- `--prod-hosts`

## Common optional flags

- `--dev-hosts`, `--registrar`, `--dns-provider`, `--email-enabled`, `--email-provider`
- `--account-id`, `--account-name` (agent can look up account id after Cloudflare API token)
- `--worker-prod` / `--worker-dev` or `--pages-project`
- `--deploy-dev` / `--deploy-prod`
- `--output` only when you intentionally override the default path

## After create

```bash
npm run readiness
# or
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run \
  --project-root . \
  --site-profile ./bakery.site-profile.json
```

## Purpose

AI conversation remains the intake UI. This CLI is the deterministic writer + checklist so agents do not hand-author brittle profile JSON.
