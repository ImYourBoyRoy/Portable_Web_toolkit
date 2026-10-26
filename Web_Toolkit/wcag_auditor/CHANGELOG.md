# Changelog — portable-wcag-auditor (toolkit wrapper)

## 3.0.0

- Thin site-profile bridge only. Evidence engine is `@imyourboyroy/wcagate` from `github:imyourboyroy/WCAGate` (unpinned), installed under `Web_Toolkit/node_modules`.
- Auto-ensure on doctor/run/core-path (`--skip-engine-install` to fail instead). `--update-engine` / `npm run wcagate:update` reinstalls the GitHub spec (npm update does not refetch git deps).
- `core-path` prints the engine package root. Never resolves `AI/wcag-auditor`.
- Accepts `wcag-auditor.config.mjs` and `wcagate.config.mjs`. Results HTML prefers `results.html`.

## 2.0.3

- Re-bundled engine (superseded). Glassmorphism / frost UI path.

## 2.0.1

- Resolve core only from this directory (no `AI/` / `WCAG_AUDITOR_ROOT` discovery). Superseded by 3.0.0 GitHub install.

## 2.0.0

- Extracted standalone WCAGate; toolkit later re-bundled, then restored as a thin bridge.
