# Cloudflare Agent Toolkit

Portable Cloudflare automation CLI for profile-driven Astro / Cloudflare sites.

## What it does

Use `cf-agent` to:

- audit token permissions
- self-repair token permissions when allowed
- audit site posture, DNS, routes, and analytics
- emit AI-agent-only JSON for performance switch posture
- compare public DNS propagation against Cloudflare + local resolver views
- audit redirects, cache rules, managed headers, origin rules, and WAF/ruleset posture
- audit email-related DNS posture when mailbox continuity matters
- audit or fix Cloudflare-managed `robots.txt` / `Content-Signal` posture when a site should not expose AI crawler directives
- verify worker routes
- harden Cloudflare settings with dry-run defaults
- wrap dev/prod deploys
- trigger portable cache purge helpers

## Core commands

```bash
node ./bin/cf-agent.mjs permissions audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs permissions repair --site-profile ../site-profiles/example-workers.json --apply
node ./bin/cf-agent.mjs site audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs site harden --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs dns audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs dns public --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs rules audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs performance audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs email audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs robots audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs robots fix --site-profile ../site-profiles/example-workers.json --apply
node ./bin/cf-agent.mjs dns fix --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs deploy dev --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs deploy prod --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs workers verify --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs cache purge --site-profile ../site-profiles/example-workers.json
```

## Shared configuration

- shared env: `../.env`
- optional project env fallback: `<project-root>/.env`
- site profiles: `../site-profiles/*.json`

If no API token secret is configured, some read-only audits can fall back to Wrangler OAuth.
Mutating commands and token-inspection commands still require a real `CLOUDFLARE_API_TOKEN`.
`robots audit|fix` additionally require Cloudflare API token scopes for **Bot Management Read** and **Bot Management Write**.

## Agent-only performance audit

`performance audit` is intentionally machine-readable:

- stdout is compact JSON only
- the full report is saved under `.runtime/reports/cloudflare/`
- Cloudflare legacy/API mismatches are separated as `externalNoise`
- fixable drift appears only in `actionableIssues`

```json
{
  "schemaVersion": "agent-cloudflare-performance-v1",
  "status": "pass",
  "switches": {
    "brotli": "on",
    "http3": "on",
    "rocketLoader": "off",
    "effectiveAutoMinify": true
  },
  "actionableIssues": [],
  "externalNoise": []
}
```

## Safety defaults

- Mutations are dry-run first unless `--apply` is passed.
- `dns fix` only adjusts low-risk proxied-state mismatches on existing records.
- `site harden` uses smoke checks and keeps Auto Minify out of the recommended baseline.
- `deploy dev|prod` expects project validation to happen first.
- `dns public` is read-only and useful after registrar/DNS changes while propagation settles.
- `email audit` is advisory only; it does not change mailbox records.

## Verify

```bash
npm run verify
```
