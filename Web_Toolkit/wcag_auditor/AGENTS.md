# WCAG Auditor wrapper — Agent Instructions

Site-profile CLI for toolkit-managed websites. Engine is WCAGate.

## Rules

- Website / toolkit workflows call **only** `Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs`.
- Never open sibling `AI/wcag-auditor` trees for site work.
- `core-path` must print `…/Web_Toolkit/node_modules/@imyourboyroy/wcagate` (the engine), not an `AI/` path.
- Missing engine → `cd Web_Toolkit && npm install --allow-git=all` (or let auto-ensure run). Fail closed (exit 2). Never silent pass.
- After a run: tell the user gate `0/1/2/3` and findings with `file:line`. Optional HTML is `results.html`, not a GUI.
- Evidence gate only — do not invent WCAG conformance percentages.

```bash
node <toolkit>/Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs doctor --site-profile <profile>
node <toolkit>/Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile <profile> --base-url <url>
```
