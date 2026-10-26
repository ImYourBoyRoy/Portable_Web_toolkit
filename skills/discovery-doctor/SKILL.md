---
name: discovery-doctor
description: Run Portable Web Toolkit discovery-doctor to verify robots, sitemap, llms, humans, security.txt, content APIs, and JSON-LD for toolkit-managed sites. Use before deploy on dist output and after production deploy on the live URL.
---

# Discovery Doctor

```bash
# Workers SSR output
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist/client
# Pages static
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist
# Live
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs https://example.com
# Site-specific contract and public API/MCP checks
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs https://example.com --site-profile ./site.site-profile.json
# One-off gates
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist --require-llms --skip-link-checks
```

## Rules

1. Failures before production deploy are blockers for the active policy.
2. The default toolkit contract requires robots, sitemap, llms.txt, llms-full.txt, humans.txt, security.txt, the structured content API, headers, and JSON-LD. Explicitly relaxed or runtime-only resources are INFO when absent; present-but-invalid resources are failures.
3. Prefer toolkit discovery generators — never `@astrojs/sitemap` / `@astrojs/robots`.
4. Environment-aware: preview/dev should noindex and does not require sitemap or security.txt by default; production allows indexing and requires the full core contract.
5. Pass `--site-profile` so `diagnostics.discovery` can declare required public APIs and MCP endpoints without hardcoding a client into the toolkit.
6. Live MCP checks use modern `2026-07-28` discovery with legacy `2025-11-25` fallback; they never call tools or send credentials.
7. PageSpeed Insights measures performance; it is not an `llms.txt` conformance authority.

