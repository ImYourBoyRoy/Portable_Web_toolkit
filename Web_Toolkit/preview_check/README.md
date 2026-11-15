# Preview Check

Pre-deploy checks against a local preview or any URL. PageSpeed Insights only sees public URLs, so this fills the gap
before a deploy and encodes the rules that keep cinematic pages fast and accessible.

| Command | What it proves |
|---------|----------------|
| `lighthouse` | Scores, core metrics and failing audits for each route and strategy (mobile and desktop). Raw reports go to `output/preview-check/`. |
| `layout` | No horizontal overflow at 375, 768 and 1440 px; names the offending elements (for example a `1fr` grid stretched by a `nowrap` code block). |
| `contrast` | Every visible text node against its resolved background in dark and light schemes (optionally after a click, such as opening the mobile menu). Lists WCAG AA failures, separating certain ones from backgrounds with images or gradients. axe/WCAGate report translucent backgrounds only as `cantTell`, so this is the check that catches white text on a pale button. |
| `motion` | Reduced motion leaves no scroll-driven or infinite animation and no canvas; no above-the-fold text is gated by opacity (LCP risk); no canvas on a phone viewport; the page has real content with JavaScript off. |

## Usage

```bash
# serve a production build first, for example: npx wrangler dev --config dist/server/wrangler.json --port 8791
node ./Web_Toolkit/preview_check/bin/preview-check.mjs lighthouse --url http://127.0.0.1:8791 --routes /,/about/ --min 100
node ./Web_Toolkit/preview_check/bin/preview-check.mjs layout --url http://127.0.0.1:8791 --routes /,/software/
node ./Web_Toolkit/preview_check/bin/preview-check.mjs motion --url http://127.0.0.1:8791 --routes /
node ./Web_Toolkit/preview_check/bin/preview-check.mjs contrast --url http://127.0.0.1:8791 --routes /,/about/ --schemes dark,light
node ./Web_Toolkit/preview_check/bin/preview-check.mjs contrast --url http://127.0.0.1:8791 --routes / --width 390 --click "#mobileMenuBtn"
```

stdout is compact JSON (`preview-check-<tool>-v1`); exit code `2` means a check failed, `1` means the tool could not run.

## Requirements

- `layout` and `motion`: `playwright` and Chromium in the project (`npm install -D playwright && npx playwright install chromium`).
- `lighthouse`: runs through `npx --yes lighthouse` and a local Chrome (set `CHROME_PATH` if needed).
- Do not point it at `astro dev`: the dev toolbar and unminified assets distort every number. Use a production build.

## Notes

- `wrangler dev` serves a stale asset index after a rebuild (404s); restart it after each build.
- Software GL (SwiftShader, llvmpipe) is what headless Chrome and PageSpeed use. Cinematic canvases should skip software
  renderers, so these checks measure the static state, which is also what PageSpeed scores.
