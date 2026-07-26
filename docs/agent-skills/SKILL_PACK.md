# Agent skills index

The root `skill-pack.json` is the authoritative inventory, version, tier, and
installation policy for this skill pack. Governance files stay outside
`skills/` so native plugin scanners see only actual skills.

## Core

| Skill | Purpose |
|---|---|
| `portable-web-toolkit` | Route toolkit-managed Astro and Cloudflare work |
| `site-readiness` | Establish readiness evidence and next actions |
| `site-starter` | Start a toolkit-managed site from approved templates |
| `toolkit-update` | Compare and reconcile toolkit or skill versions |

## Optional

| Skill | Purpose |
|---|---|
| `instagram-clone` | Prepare a public-profile static gallery fallback |
| `vectorize-pipeline` | Prepare authorized font or raster SVG candidates |

## Inspect and validate

```bash
node ./scripts/validate-skills.mjs
node ./scripts/check-agent-skills.mjs --agent cursor --scope user
```

The status helper never installs. Agents should follow
[`INSTALL_PROTOCOL.md`](./INSTALL_PROTOCOL.md), preserve conflicts, and install
only the selected client, scope, and skills.

Cross-platform command conventions are documented in
[`CROSS_PLATFORM.md`](./CROSS_PLATFORM.md).
