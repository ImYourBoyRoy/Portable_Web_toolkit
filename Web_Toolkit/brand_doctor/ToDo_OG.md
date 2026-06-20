# Brand Doctor: Design Automation Tasks

Refactor `brand_doctor` into a portable, deterministic design-automation toolkit.

## Phase 1: Core Infrastructure [COMPLETED]

- [x] **CairoSVG Integration**: Native support for SVG masters.
- [x] **Managed Runtime**: Automatic environment bootstrapping via `setup-env`.
- [x] **Declarative Architecture**: Tiered JSON configuration model (`config.json` -> `spec.json`).
- [x] **Deterministic Python Bridge**: Resolved `spawnSync` mis-invocations and Pillow `OSError` reporting.
- [x] **Canonical Content Schema**: Standardized on `eyebrow` (formerly "badge").

## Phase 2: Functional Refinement [IN PROGRESS]

- [x] **Deterministic Auto-Layout**: Base logic tree (split, logo-focus, minimal) implemented.
- [x] **Sanitized Paths**: Stripping whitespace from Windows file paths.
- [x] **Site-Awareness**: Auto-discovery of main site root and `.gitignore` support.
- [x] **Relocated Context**: Bound managed environments to Site Root instead of toolkit.
- [/] **Text Measurement**: Implement intelligent wrapping using `textbbox`/`textlength`.
- [x] **Asset Discovery**: Improved discovery heuristics for Astro (`src/assets/logo.png`).

## Phase 4: Site-Level Architecture [COMPLETED]

- [x] **Root Discovery**: Implementation of `findSiteRoot` helper.
- [x] **Ignore Logic**: Standardized respect for `.gitignore` in searches.
- [x] **Cleanup**: Removed legacy `.python-version` from subfolders.
- [x] **Asset Verification**: Verified discovery of `example.com` master assets.

---

> [!TIP]
> Always run `node bin/brand-doctor.mjs setup-env` first when running in a new environment to ensure all binary dependencies (Pillow, CairoSVG) are correctly linked.
> [!IMPORTANT]
> The renderer uses RGB mode for core image processing (OpenGraph standard). Alpha channels are handled via temporary RGBA layering to prevent corruption of the base PNG frame.
