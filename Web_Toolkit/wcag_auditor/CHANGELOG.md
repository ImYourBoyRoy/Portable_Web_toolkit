# Changelog — portable-wcag-auditor (toolkit module)

## 2.0.3 - 2026-08-11

### Added

- First-class **glassmorphism / frost UI** path: `docs/GLASSMORPHISM.md`, starter `frost-glass-contrast` manual-evidence check, Astro examples.
- Suppressions may set `outcomes: ["cantTell"]` (default remains `["failed"]`) so axe incomplete contrast on translucent surfaces can be resolved after manual AA verification.
- Axe `color-contrast` cantTell remediations include frost-aware guidance and tags (`frost-ui-review`, `glassmorphism-friendly`).

### Changed

- Astro example config uses `unresolvedEvidence: "error"` (resolve frost via evidence + cantTell suppressions; do not ignore).

## 2.0.2 - 2026-08-11

### Added

- Stakeholder `dashboard` reporter (`wcag-audit-dashboard.html`) with filters, rule bars, and file:line columns.
- Best-effort source locator maps Playwright/axe selectors and HTML snippets to client `src/` file:line.
- CLI prints the absolute dashboard path after toolkit runs for easy sharing.

### Changed

- Profile/ephemeral/default reporter sets include the dashboard HTML artifact.

## 2.0.1 - 2026-08-04

### Fixed

- Resolve core only from this `Web_Toolkit/wcag_auditor` directory (no `AI/` / `WCAG_AUDITOR_ROOT` discovery).
- Playwright browser lookup via `playwright.default` when the package is imported as CJS under a file URL.

### Changed

- Module is the full evidence engine again (not a thin external bridge).

## 2.0.0 - 2026-08-04

- Extracted as a standalone repository at `AI/wcag-auditor` for shared use across websites and apps (Portable Web Toolkit keeps only a thin site-profile bridge).
