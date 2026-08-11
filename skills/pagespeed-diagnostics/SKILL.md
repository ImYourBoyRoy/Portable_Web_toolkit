---
name: pagespeed-diagnostics
description: Run Portable Web Toolkit PageSpeed Insights diagnostics (Google PSI) for toolkit-managed sites. Use when measuring Core Web Vitals or PSI categories after deploy or during maintenance. Requires GOOGLE_PAGESPEED_API_KEY in the client .env.
---

# PageSpeed Diagnostics

Thin skill for Google PageSpeed Insights via the toolkit CLI.

## Prerequisites

- Client `.env` has `GOOGLE_PAGESPEED_API_KEY` (section A).
- `*.site-profile.json` and linked `Web_Toolkit/`.

## Commands

```bash
node ./Web_Toolkit/pagespeed_diagnostics/bin/pagespeed-diagnostics.mjs run \
  --site-profile ./<site>.site-profile.json --strategy both

# Agent-friendly batch / regression
node ./Web_Toolkit/pagespeed_diagnostics/bin/pagespeed-diagnostics.mjs agent-batch \
  --site-profile ./<site>.site-profile.json --routes core --strategy mobile
node ./Web_Toolkit/pagespeed_diagnostics/bin/pagespeed-diagnostics.mjs agent-diff \
  --site-profile ./<site>.site-profile.json
```

## Rules

1. Prefer measuring **after** remote cache warm (cold edge skews scores).
2. Summarize CWV + top opportunities; propose a minimal fix plan before editing.
3. 100/100/100/100 is a target — do not break brand, forms, or a11y chasing scores.

