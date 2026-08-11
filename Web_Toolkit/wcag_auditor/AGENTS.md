# WCAG Auditor — Agent Instructions

Self-contained accessibility evidence gate bundled inside Portable Web Toolkit
at `Web_Toolkit/wcag_auditor/`.

## Authority

1. Explicit user request
2. This module's `AGENTS.md` / `README.md`
3. Parent toolkit `AGENTS.md` / `OPERATIONS.md` when operating on toolkit-managed sites
4. Consumer project instructions when auditing inside that project

## Rules

- Do **not** invent WCAG conformance percentages or claim certification.
- Prefer adapter evidence (`playwright-axe`, `svelte`, `manual-evidence`, `native-evidence`) over source regex heuristics.
- Fail closed: missing targets, empty surfaces, and adapter failures are exit `2` / unresolved `3`, never silent passes.
- Glassmorphism / frost UI is supported: axe contrast incompletes are `cantTell`, not a mandate to remove frost. Resolve via AA design tweaks + `frost-glass-contrast` manual evidence + bounded `outcomes: ["cantTell"]` suppressions (`docs/GLASSMORPHISM.md`).
- Keep secrets out of configs, suppressions, and committed reports.
- Verify Node/package versions from this repo + registry — do not trust model memory.
- Website / toolkit workflows resolve **only** this module (`core-path` under `Web_Toolkit/wcag_auditor`). Never open sibling `AI/` trees for the auditor.

## Apps and sites

Sites and apps that use the Portable Web Toolkit install should call:

```bash
node <toolkit>/Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs …
```

Optional peers (`playwright`, `@axe-core/playwright`, `svelte`) install in the **consumer** project, not inside this module.
