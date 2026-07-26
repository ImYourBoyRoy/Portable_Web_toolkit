# Portable Web Toolkit — Agent Instructions (Web_Toolkit)

> **Canonical copy:** see [`../AGENTS.md`](../AGENTS.md) at the repo root.

## Do first

1. [`../START_HERE.md`](../START_HERE.md)
2. `README.md`
3. `OPERATIONS.md` (reference — primary path is `site-readiness` JSON)
4. `ARCHITECTURE.md`

When this directory is linked into a client project, the client repository's
applicable instructions govern site work. This file governs toolkit source and
does not override client safety or release policy.

## What matters most

- `site-profiles/*.json` (or `--site-profile` path) drives all tools
- Target project root `.env` for live secrets — not toolkit `.env`
- Generated artifacts in `.runtime/` only
- Dry-run before `--apply` on Cloudflare, DNS, cache, registrar
- Custom discovery generators — **not** `@astrojs/sitemap` / `@astrojs/robots`
- `site-readiness run` before material work when current evidence is absent or stale

## Site deploy gate

1. `site-readiness run` → read JSON report
2. `npm run check` → `npm run build`
3. `discovery-doctor` on `./dist`
4. Staging → smoke → production → live discovery
5. Sync **client** `MEMORY.md` + Brand Guide if identity changed

Infrastructure: **audit → dry-run → `--apply`**. Full sequence: `OPERATIONS.md`.

## Skills

The versioned source is `../skill-pack.json`. From the repository root,
`node ./scripts/check-agent-skills.mjs --agent <client>` reports status without
changing files. An authorized installation follows
[`../docs/agent-skills/INSTALL_PROTOCOL.md`](../docs/agent-skills/INSTALL_PROTOCOL.md);
the helper is not an installer. The master router is **portable-web-toolkit**.
