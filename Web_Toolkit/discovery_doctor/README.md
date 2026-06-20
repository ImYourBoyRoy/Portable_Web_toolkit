# Discovery Doctor Toolkit 🩺

The definitive Zenith-level audit utility for verifying the site's AI-Native discovery markers, structured storytelling endpoints, and A+ security signatures.

## Purpose

`Discovery Doctor` ensures that the site remains at the absolute forefront of AI-Native architecture. It validates the "High-Density Discovery" layer—including Vision-Ready Sitemaps, Deep Manifests, JSON-LD Knowledge Graphs, and the Dynamic Search API.

> [!IMPORTANT]
> **Operator Note**: This is the primary verification tool for all SEO, AI-Storytelling, and Hardening workflows. No protocol change is considered verified until `Discovery Doctor` returns a 100% PASS rate.

## Features

- **Zenith Posture Audit**: Point the tool at a live URL (e.g., `https://example.com`) to check production discovery.
- **Build-Fidelity Audit**: Point the tool at a local directory (e.g., `./dist`) to verify artifacts before deployment.
- **Deep Manifest Validation**:
  - ✅ **Sitemap**: XML validity and image-extension manifests.
  - ✅ **Robots**: AI-friendly posture and sitemap linkage.
  - ✅ **Structured Data**: Deep-scan for `Person`, `WebSite`, and `BreadcrumbList` schemas.
  - ✅ **Security Hardening**: Detection of A+ headers (HSTS, CSP, Nosniff) in Cloudflare `_headers`.
  - ✅ **Dynamic Endpoints**: Validation of `api/content.json`, `api/search.json`, and `humans.txt`.

## Usage

### Local Build Audit

```bash
node bin/discovery-doctor.mjs ../../dist
```

### Path-to-URL Audit

```bash
node bin/discovery-doctor.mjs https://example.com
```

## Integration Guide

All models and operators should include `Discovery Doctor` in their verification cycle:

1. Modify pages, metadata, or hardening rules.
2. Run your build pipeline (`npm run build`).
3. Execute `Web_Toolkit/Discovery_Doctor.bat` against your `dist` folder.
4. Resolve all `[FAIL]` status before shipping to production.

---
Created by: Roy Dawson IV
GitHub: [https://github.com/imyourboyroy](https://github.com/imyourboyroy)

