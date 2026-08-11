# Browser Diagnostics

Real-browser diagnostics for live production and development hosts.

This tool uses **Python Playwright** to:

- open live routes in Chromium
- capture console warnings/errors
- capture page/runtime errors
- classify failed requests while ignoring common aborted analytics beacons
- record basic browser timing metrics:
  - DOM content loaded
  - load event
  - first paint
  - first contentful paint
  - largest contentful paint
  - cumulative layout shift
- optionally capture screenshots
- optionally run an extra Lighthouse pass for the production root URL

## Usage

```bash
node ./bin/browser-diagnostics.mjs run --site-profile ../site-profiles/example-workers.json
node ./bin/browser-diagnostics.mjs run --site-profile ../site-profiles/example-workers.json --screenshots --lighthouse
node ./bin/browser-diagnostics.mjs run --site-profile ../site-profiles/example-workers.json --lighthouse --lighthouse-preset desktop
```

## Notes

- Soft-ensures **Python Playwright + Chromium** on run (unless `--skip-playwright-install`).
- `Setup_agent_environment` can also install Python Playwright and Chromium in the managed venv.
- This tool is non-mutating.
- `site-doctor run` can include this tool automatically unless you pass `--skip-browser-diagnostics`.
- For JS-injected cookie banners missed by HTML-only smoke, prefer this tool.
