# GitHub repository metadata

Canonical description and **Topics** for [Portable_Web_toolkit](https://github.com/imyourboyroy/Portable_Web_toolkit).

Source of truth: [`github-repository.json`](./github-repository.json)

## Apply (after `GH_TOKEN` in gitignored `.env` or `gh auth login`)

```bash
node ./scripts/set-github-topics.mjs
```

Full safe publish (verify secrets → privacy scan → push → topics):

```bash
node ./scripts/publish-github.mjs
```

Preview without changes:

```bash
node ./scripts/set-github-topics.mjs --dry-run
```

## What stays private (gitignored)

| Path | Why |
|------|-----|
| `.env` | All tokens including `GH_TOKEN` |
| `Private_Site_Profiles/` | Client site profiles |
| `MEMORY.md`, `RED_TEAM_REPORT.md` | Operator session notes |
| `github-repository.local.json` | Optional local topic overrides |

Public scripts like `set-github-topics.mjs` contain **no secrets** — they read tokens from your local `.env` only.

## Topics (20)

| Topic | Why |
|-------|-----|
| `astro` | Primary site framework |
| `cloudflare` | Hosting platform |
| `cloudflare-workers` | Workers deploy target |
| `cloudflare-pages` | Pages deploy target |
| `wrangler` | Deploy CLI |
| `vite` | Astro build toolchain |
| `ai-agents` | Agent-first design |
| `agent-skills` | Cursor / Claude / Copilot skills |
| `cursor` | Primary agent IDE |
| `cli-tools` | Node CLI modules |
| `devops` | Deploy, DNS, cache, hardening |
| `deployment` | Staging → prod workflow |
| `static-site` | Pages / static output |
| `web-development` | General discoverability |
| `nodejs` | Runtime baseline (26+) |
| `seo` | Discovery doctor, sitemap, robots |
| `llms-txt` | AI-native discovery layer |
| `open-source` | MIT license |
| `site-generator` | Client site scaffolding |
| `automation` | Readiness loop, cf-agent |

## Description

> AI-agent-first toolkit for Astro + Cloudflare sites: agent skills, CLI tools (readiness, deploy, discovery), and client starter templates.

Update `github-repository.json` when the repo focus changes, then re-run the script.
