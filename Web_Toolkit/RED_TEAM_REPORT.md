# Red Team Report: Portable Web Toolkit

Audit date: 2026-06-15  
Status: remediated in this workspace

This report tracks the original red-team findings and the hardening work applied to the portable toolkit and wrapper project.

## Remediated

### Safety defaults
- `cf-agent harden zone` now defaults to dry-run unless `--apply` is passed.
- `Optimize_Loop.bat` cache purge is dry-run by default; live purge requires `--apply`.
- Root npm scripts no longer auto-apply cache purge.
- `dns fix` no longer creates missing records unless both `--apply` and `--create-missing` are passed.

### Profile and deploy hardening
- Site profiles are validated at load time via `shared/lib/site-profile.mjs`.
- Deploy commands must match an allowlisted runner prefix and cannot contain shell metacharacters.
- Resolved project roots must exist and contain a project marker when the target directory is present.

### Privacy and export
- Fixed privacy scanner `.json` detection regex.
- Added detection for `Private_Site_Profiles/` and `*.site-profile.json`.
- Export tooling excludes `Private_Site_Profiles/` by default.

### Wrapper project cleanup
- Root `package.json` no longer hardcodes site profile/project names.
- Added ESM-safe `scripts/cf-deploy-pages.mjs` and neutral `scripts/site-tool.mjs`.
- Root `.gitignore` now ignores private profiles, runtime residue, and secrets consistently.
- Node baseline pinned to latest current line via `.node-version` and `engines.node >=25.9.0`.

### Runtime hygiene
- `toolkit_purge` no longer deletes arbitrary nested `output/` / `dist/` trees.
- `image_pipeline` no longer auto-installs Pillow into the active Python environment.
- `brand-doctor setup-env` no longer uses `shell: true` for subprocesses.
- Shared public HTTP guardrails added in `shared/lib/url-safety.mjs` for discovery/integration/sourcing fetch helpers.

## Still operator-dependent

- Live deploy/purge/harden/registrar mutations still require explicit `--apply` and valid project credentials.
- Private profiles should remain outside published toolkit copies and be passed with `--site-profile`.
- Root npm site scripts require `PORTABLE_DEFAULT_PROFILE` or `--site-profile`.
- Initialize git locally if you want version-control protection for `.env` and private profiles.

## Recommended next hardening

- Add a dedicated asset import case-parity audit for Linux deploy safety.
- Add optional profile signing or checksum verification before deploy execution.
- Centralize remaining per-tool output path helpers into shared runtime utilities.

---
*Updated for Roy Dawson IV on 2026-06-15.*
