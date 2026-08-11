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

Read-only audits:

```bash
node ./bin/cf-agent.mjs permissions audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs site audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs dns audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs dns public --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs rules audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs performance audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs email audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs robots audit --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs workers verify --site-profile ../site-profiles/example-workers.json
```

Mutations (dry-run first, then `--apply`):

```bash
node ./bin/cf-agent.mjs permissions repair --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs permissions repair --site-profile ../site-profiles/example-workers.json --apply

node ./bin/cf-agent.mjs site harden --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs site harden --site-profile ../site-profiles/example-workers.json --apply

node ./bin/cf-agent.mjs dns fix --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs dns fix --site-profile ../site-profiles/example-workers.json --apply

node ./bin/cf-agent.mjs robots fix --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs robots fix --site-profile ../site-profiles/example-workers.json --apply

node ./bin/cf-agent.mjs deploy dev --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs deploy dev --site-profile ../site-profiles/example-workers.json --apply

node ./bin/cf-agent.mjs deploy prod --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs deploy prod --site-profile ../site-profiles/example-workers.json --apply

node ./bin/cf-agent.mjs deploy pages --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs deploy pages --site-profile ../site-profiles/example-workers.json --apply

node ./bin/cf-agent.mjs deploy workers --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs deploy workers --site-profile ../site-profiles/example-workers.json --apply

node ./bin/cf-agent.mjs cache purge --site-profile ../site-profiles/example-workers.json
node ./bin/cf-agent.mjs cache purge --site-profile ../site-profiles/example-workers.json --apply

node ./bin/cf-agent.mjs pages setup --domains www.example.com,example.com --project my-site
node ./bin/cf-agent.mjs pages setup --domains www.example.com,example.com --project my-site --apply

node ./bin/cf-agent.mjs scaffold astro-analytics --project-root ../site-starter --ga4-id G-XXXX
node ./bin/cf-agent.mjs scaffold astro-analytics --project-root ../site-starter --ga4-id G-XXXX --apply
```

## Shared configuration

- shared env: `../.env`
- optional project env fallback: `<project-root>/.env`
- site profiles: `../site-profiles/*.json`

If no API token secret is configured, some read-only audits can fall back to Wrangler OAuth.
Mutating commands and token-inspection commands still require a real `CLOUDFLARE_API_TOKEN`.
`robots audit|fix` additionally require Cloudflare API token scopes for **Bot Management Read** and **Bot Management Write**.

## API token recipe (hand-holding)

Agents cannot create dashboard tokens. Guide the user to **My Profile → API Tokens → Create Token → Custom** with **Edit/Write** groups matching `REQUIRED_PERMISSION_NAMES` in `src/config/defaults.mjs`, including:

- Zone Edit family (Zone/DNS/Cache/SSL/WAF/Workers Routes/Pages, …)
- Account Edit family (Workers Scripts/KV/R2/D1, Account Rulesets, …)
- **API Tokens Write** and **Account API Tokens Write** (needed for `permissions repair`)
- **Gateway Write** (Cloudflare One / Gateway Edit when Zero Trust Gateway is in scope)

Include the target **Account** and **Zone** resources. Paste into the **client project** `.env` as `CLOUDFLARE_API_TOKEN` (never commit). Verify with:

```bash
node ./bin/cf-agent.mjs permissions audit --site-profile <profile>
```

Full staged walkthrough: [`docs/agent-skills/ONBOARDING_STAGES.md`](../../docs/agent-skills/ONBOARDING_STAGES.md) stage **S3**.

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
- `dns fix` only adjusts low-risk proxied-state mismatches on existing records (matched by name **and** type).
- `site harden` uses smoke checks; SSL rollback triggers only on production hosts with HTTP 525/526/530 (not network failures).
- `site harden` keeps Auto Minify out of the recommended baseline.
- `deploy dev|prod|pages|workers` expect project validation to happen first.
- `dns public` is read-only and useful after registrar/DNS changes while propagation settles.
- `email audit` is advisory only; it does not change mailbox records.

## Verify

```bash
npm run verify
```
