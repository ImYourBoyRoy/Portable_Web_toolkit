# Site Snapshots

Keeps the "latest look" screenshots of other sites (client work, your own products) current, so a portfolio never shows
a page the way it looked months ago. Recyclable: one small JSON config per site, no code changes.

| Command | What it does |
|---------|--------------|
| `capture` | Photographs each page (1440x900 by default, reduced motion, fonts loaded, consent banners dismissed or hidden), writes `<outputDir>/<id>.jpg` and the manifest. Rewrites an image only when the page visibly changed. A failed capture keeps the old image. Dry run unless `--apply`. |
| `check` | Compares each stored image with the live page and reports `missing`, `stale` (older than `maxAgeDays`) and `drift` (visible change above `driftThreshold`). Writes nothing; exit `2` when anything needs a refresh. |

## Config (`site-snapshots.config.json` in the project root)

```json
{
  "source": "src/data/project-sites.json",
  "itemsPath": "projects",
  "idField": "id",
  "urlField": "url",
  "optionsField": "snapshot",
  "outputDir": "src/assets/snapshots",
  "manifest": "src/data/snapshots.json",
  "maxAgeDays": 30,
  "driftThreshold": 0.06
}
```

- `source` is any JSON list; `itemsPath` is a dotted path to the array. Entries need an id and an http(s) URL.
- Per-item options live under `optionsField` on each entry: `hideSelectors` (CSS to hide, for example a cookie banner),
  `dismiss` (extra button labels to click), `waitMs`, `fullPage`, `skip: true`.
- Other defaults: `viewport` 1440x900, `colorScheme` dark, `quality` 84, `settleMs` 1500, `dismissLabels` (common
  "decline", "keep analytics off", "reject all" buttons).

## Usage

```bash
node ./Web_Toolkit/site_snapshots/bin/site-snapshots.mjs check --project-root .
node ./Web_Toolkit/site_snapshots/bin/site-snapshots.mjs capture --project-root . --apply
node ./Web_Toolkit/site_snapshots/bin/site-snapshots.mjs capture --project-root . --only my-client --apply
```

Wire the images through your framework's image pipeline so they are optimized (Astro: `import.meta.glob('../assets/snapshots/*.jpg', { eager: true })`
then `Picture`/`getImage`). Run `check` before a deploy and `capture --apply` for what it lists. Public hosts only
(`--allow-loopback` for a local preview); needs `playwright` (Chromium) and `sharp` in the project.
