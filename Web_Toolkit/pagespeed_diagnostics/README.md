# PageSpeed Diagnostics

Runs the Google PageSpeed Insights API against the production site URL from the active site profile.

## Usage

```bash
node ./bin/pagespeed-diagnostics.mjs run --site-profile ../site-profiles/example-workers.json
node ./bin/pagespeed-diagnostics.mjs run --site-profile ../site-profiles/example-workers.json --strategy mobile
```

## Agent-only usage

These commands are built for AI agents, not humans:

- stdout is compact JSON only
- raw PSI payloads are written to files
- actionable issues are omitted when scores and thresholds pass
- known external noise, such as Cloudflare Analytics beacon caching, is separated from fixable issues

```bash
node ./bin/pagespeed-diagnostics.mjs agent-batch --site-profile ../site-profiles/example-workers.json --routes core --strategy mobile
node ./bin/pagespeed-diagnostics.mjs agent-diff --site-profile ../site-profiles/example-workers.json
```

### `agent-batch` output contract

```json
{
  "schemaVersion": "agent-pagespeed-batch-v1",
  "status": "pass",
  "stats": {
    "checks": 2,
    "failedChecks": 0,
    "actionableIssueCount": 0
  },
  "actionableIssues": [],
  "externalNoise": [],
  "files": {
    "agentReport": "output/pagespeed-agent-batch-*.json",
    "rawReports": ["output/pagespeed-raw-*.json"]
  }
}
```

### `agent-diff` output contract

```json
{
  "schemaVersion": "agent-pagespeed-diff-v1",
  "status": "pass",
  "regressions": [],
  "improvements": [],
  "fixedIssues": []
}
```

## Notes

- prefers `GOOGLE_PAGESPEED_API_KEY` / `PAGESPEED_API_KEY` from the project root `.env`
- can still work without an API key, but quota limits are more likely
- use this alongside `browser_diagnostics` and `site_quality_smoke`, not instead of them
- the generated JSON/Markdown reports now include:
  - LCP element snippet
  - LCP subpart timing breakdown
  - forced reflow sources
  - cache-lifetime culprits
  - render-blocking resource culprits
