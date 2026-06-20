# Portable Web Toolkit — Agent Instructions (Web_Toolkit)

> **Canonical copy:** see `../AGENTS.md` at the Portable_Web_toolkit repo root.  
> **Do not use** `AGENT.md` in this folder — it is a deprecated generic template.

## Do first

1. `README.md`
2. `OPERATIONS.md`
3. `ARCHITECTURE.md`
4. `RUNBOOKS.md`
5. `CHECKLIST.md`
6. `MEMORY.md` (recent validated facts only)

## What matters most

- `site-profiles/*.json` (or `--site-profile` path) drives all tools
- Target project root `.env` for live secrets — not toolkit `.env`
- Generated artifacts in `.runtime/` only
- Dry-run before `--apply` on Cloudflare, DNS, cache, registrar
- Custom discovery generators — **not** `@astrojs/sitemap` / `@astrojs/robots`
- `project-init` for fresh/partial client roots; `toolkit-report` when phase is unclear

## Site deploy gate

1. `npm run check` → `npm run build`
2. Discovery generators refreshed; `stylesheet-check` if CSS changed
3. `discovery-doctor` on `./dist`
4. Deploy staging → smoke → production
5. Live `discovery-doctor` on production URL
6. Sync client `MEMORY.md` + Brand Guide if identity changed

Infrastructure: **audit → dry-run → `--apply`**. Full sequence: `OPERATIONS.md`.

## Cursor skill

Install from repo root: `../scripts/install-cursor-skills.ps1` — skill name **portable-web-toolkit**.
