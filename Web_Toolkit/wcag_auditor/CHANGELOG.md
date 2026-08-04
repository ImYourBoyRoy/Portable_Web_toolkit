# Changelog — portable-wcag-auditor (toolkit module)

## 2.0.1 - 2026-08-04

### Fixed

- Resolve core only from this `Web_Toolkit/wcag_auditor` directory (no `AI/` / `WCAG_AUDITOR_ROOT` discovery).
- Playwright browser lookup via `playwright.default` when the package is imported as CJS under a file URL.

### Changed

- Module is the full evidence engine again (not a thin external bridge).

## 2.0.0 - 2026-08-04

- Extracted as a standalone repository at `AI/wcag-auditor` for shared use across websites and apps (Portable Web Toolkit keeps only a thin site-profile bridge).
