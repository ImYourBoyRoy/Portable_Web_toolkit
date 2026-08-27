# ENGINE.md — WCAGate, not a local copy

This folder is a **site-profile wrapper** for Portable Web Toolkit sites.

The accessibility engine is **[WCAGate](https://github.com/imyourboyroy/WCAGate)** (`@imyourboyroy/wcagate`). It is installed into `Web_Toolkit/node_modules` from GitHub (unpinned default branch). It is **not** vendored here and **not** a git submodule.

## If the engine is missing

Auto-ensure runs on `wcag-auditor doctor`, `run`, and `core-path` unless you pass `--skip-engine-install`.

Manual:

```bash
cd Web_Toolkit
npm install --allow-git=all
```

npm 12+ defaults `allow-git=none`. This toolkit ships [`Web_Toolkit/.npmrc`](../.npmrc) with `allow-git=all` so that known GitHub dependency can install.

Confirm:

```bash
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs core-path
# → …/Web_Toolkit/node_modules/@imyourboyroy/wcagate
```

Do **not**:

- `git clone` into `AI/wcag-auditor` and point this wrapper at it
- add a git submodule under `wcag_auditor/`
- treat a missing engine as a pass (exit `2`)

## Updates without a toolkit version bump

```bash
cd Web_Toolkit
npm run wcagate:update
# reinstalls github:imyourboyroy/WCAGate (npm update does not refetch git deps)
# or:
node ./wcag_auditor/bin/wcag-auditor.mjs doctor --update-engine
```

Optional pin for one machine: `WCAGATE_REF=v2.3.1` (git tag/branch, not a filesystem path).
