# ADR: WCAGate is the toolkit WCAG engine

## Status
Accepted

## Date
2026-08-27

## Context

The toolkit re-bundled a full WCAG engine under `Web_Toolkit/wcag_auditor` so agents would not resolve `AI/wcag-auditor` on the operator workstation. That copy drifted (toolkit 2.0.3 vs WCAGate 2.3.x). Git submodules pin a SHA in the parent repo, so they cannot track latest WCAGate without toolkit commits. npm 12+ also requires an explicit `allow-git` for GitHub packages.

## Decision

- Canonical engine: `github:imyourboyroy/WCAGate` (`@imyourboyroy/wcagate`), unpinned default branch.
- Toolkit keeps a thin `--site-profile` wrapper at `Web_Toolkit/wcag_auditor`.
- Install into `Web_Toolkit/node_modules` (`npm install --allow-git=all`). Auto-ensure on doctor/run/core-path.
- `core-path` prints the engine package root. Never auto-discover `AI/wcag-auditor`.
- Engine updates via `npm run wcagate:update` (reinstalls `github:imyourboyroy/WCAGate`; `npm update` does not refetch git deps) without bumping toolkit VERSION.

## Alternatives considered

- Git submodule: rejected; parent SHA is a pin; zip clones and agent clones omit recurse.
- Keep the re-bundle / merge on every WCAGate change: rejected; that caused version drift.
- `file:` or `WCAG_AUDITOR_ROOT` to a local `AI/` checkout: rejected; unusable for other operators.

## Consequences

- First run needs network to fetch GitHub unless node_modules already has WCAGate.
- Unpinned `main` can break the wrapper; keep the wrapper on WCAGate public CLI/API only.
- npm 12 requires `Web_Toolkit/.npmrc` `allow-git=all` for this known GitHub dependency.
