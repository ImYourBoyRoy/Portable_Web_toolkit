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
```

## Rules

1. Failures before production deploy are blockers.
2. Prefer toolkit discovery generators — never `@astrojs/sitemap` / `@astrojs/robots`.
3. Environment-aware: preview/dev should noindex; production allows indexing.

