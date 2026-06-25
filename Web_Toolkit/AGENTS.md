# Portable Web Toolkit — Agent Instructions (Web_Toolkit)

> **Canonical copy:** see [`../AGENTS.md`](../AGENTS.md) at the repo root.

## Do first

1. [`../START_HERE.md`](../START_HERE.md)
2. `README.md`
3. `OPERATIONS.md` (reference — primary path is `site-readiness` JSON)
4. `ARCHITECTURE.md`

Local operator notes: copy `MEMORY.example.md` → `MEMORY.md` (gitignored).

## What matters most

- `site-profiles/*.json` (or `--site-profile` path) drives all tools
- Target project root `.env` for live secrets — not toolkit `.env`
- Generated artifacts in `.runtime/` only
- Dry-run before `--apply` on Cloudflare, DNS, cache, registrar
- Custom discovery generators — **not** `@astrojs/sitemap` / `@astrojs/robots`
- `site-readiness run` at the start of every client session

## Site deploy gate

1. `site-readiness run` → read JSON report
2. `npm run check` → `npm run build`
3. `discovery-doctor` on `./dist`
4. Staging → smoke → production → live discovery
5. Sync **client** `MEMORY.md` + Brand Guide if identity changed

Infrastructure: **audit → dry-run → `--apply`**. Full sequence: `OPERATIONS.md`.

## Skills

Install from repo root: `node ../scripts/install-agent-skills.mjs` — master skill **portable-web-toolkit**.
