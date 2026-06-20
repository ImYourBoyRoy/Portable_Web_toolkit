# Brand Doctor [ROY-STANDARD] [AI-READY]

Portable, deterministic design-automation toolkit for auditing branding requirements and generating high-fidelity assets (OpenGraph Images, Favicons, App Icons). This version is specifically engineered for **Agentic AI** workflows, exposing over 40 fine-grained visual tokens for precise design control.

## Core Philosophy

- **AI-Engineered**: Optimized for agentic models to "paint" site assets via declarative JSON.
- **Spec-First**: 100% of artistic parameters (glow, offsets, blur) are exposed via schema.
- **Luxe 6.0 Engine**: Ported high-fidelity "Signature" logic with multi-pass rendering.
- **SVG-First**: Native support for SVG master assets via CairoSVG.

## Quick Start (Managed)

```bash
# 1. Bootstrap the environment
node ./bin/brand-doctor.mjs setup-env

# 2. Run a design & compliance audit
node ./bin/brand-doctor.mjs audit --project-root .

# 3. Generate OG image with AI-override
node ./bin/brand-doctor.mjs generate-og --apply --signatureOffset 2 --glowPasses 8
```

## AI Agent Integration Guide

Designed to be used by an AI model to automate branding on a new project boot-up. The model should modify the `branding` block in the `site-profile.json` to control the "Director's Cut" aesthetic.

### Precision Signature Splitting

Use the `|` delimiter in the title (from `site-profile.json` or `og.spec.json`) to control exactly where the high-fidelity "Signature" effect begins.

- **Input**: `"title": "Example | Site"`
- **Output**: "Example" (Standard) + "Site" (High-Glow Signature)

### Visual Tokens (40+ levers)

Every aspect of the Luxe 6.0 engine is exposed under `branding.visuals` and `branding.colors`:

- **visuals.signature_offset_px**: Control the "boldness" of the signature glow (Default: 1).
- **visuals.glow_passes**: Number of drawing passes for the signature effect (Default: 5).
- **visuals.aurora_blur**: Radius for the background glow orbs (Default: 160).
- **visuals.noise_intensity**: Level of cinematic grain (Default: 0.005).
- **colors.accent / colors.glow**: Specific hex/HSL overrides for artistic highlights.

## Documentation (Full Schema)

Refer to `Web_Toolkit/site-profile.schema.json` for the full machine-readable specification of all 40+ branding tokens.

## Commands

- **`setup-env`**: Resolves the best Python interpreter and installs dependencies.
- **`audit`**: Deep scan of head tags, manifests, and branding assets.
- **`generate-og`**: Generates a high-fidelity OG image (1200x630).
  - `--apply`: Commit changes to disk.
  - `--signatureOffset <int>`, `--glowPasses <int>`, `--delimiter <char>`: Direct CLI overrides.
- **`generate-icons`**: Generates a complete icon suite (Favicons, Apple Touch, Android Chrome).
  - Uses `sharp` for high-performance rasterization.

## Requirements

- **Node.js**: 18+
- **Python**: 3.10+
- **Dependencies**: `Pillow`, `CairoSVG`, `sharp`, `chalk`.

## Author & Links

**Created by**: Roy Dawson IV  
**GitHub**: [https://github.com/imyourboyroy](https://github.com/imyourboyroy)  
**PyPi**: [https://pypi.org/user/example-site/](https://pypi.org/user/example-site/)
