# Sourcing Doctor

A specialized toolkit for high-fidelity content extraction from WordPress sites, designed for "Director's Cut" rebuilds.

## Purpose

The **Sourcing Doctor** automates the retrieval of legacy site data (Pages, Posts, Media) via the WordPress REST API. It transforms this data into a structured `ContentManifest.json` and downloads all associated media assets locally to ensure no data is lost during migration.

## Quick Start (example.com)

To perform a full extraction for the example-site project:

```bash
# From the Web_Toolkit/sourcing_doctor directory:
npm run extract:example-site
```

This will:
1.  Connect to `https://example.com`.
2.  Wipe and rebuild the contents of `legacy_sourcing/`.
3.  Download all posters, profile images, and page content.

## Command Reference

### `extract`
Retrieves all content and downloads media.
- **Flags**:
    - `--site-profile`: Path to the site profile JSON.
    - `--project-root`: The directory where manifests and media will be saved.

### `audit`
Checks if the target WordPress site's REST API is accessible and healthy.

## Manifest Outputs

- **`ContentManifest.json`**: All text content, metadata, and post classifications.
- **`ImageManifest.csv`**: mapping between source URLs and local download paths.
- **`URLMap.csv`**: A list of original URLs and their new slug-based paths (used for generating redirects).

## Development

This tool uses native Node.js ESM modules. Requires **Node.js 26+** (repo baseline).

