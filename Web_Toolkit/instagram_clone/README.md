# Instagram Clone

Clones a **public** Instagram profile into rich local assets for Astro portfolio sites — no Meta API tokens required.

## When to use

- Portfolio/gallery sites that display a public Instagram feed
- Before deploy or when live edge sync hits Instagram rate limits (429)
- To seed `src/data/instagram/feed.json` and local media for static fallback

## Configuration (target project)

Set the handle in the **client project** `.env` (not toolkit `.env`):

```env
INSTAGRAM_USERNAME=your_handle
INSTAGRAM_CLONE_LIMIT=24
```

Optional site-profile block (see `site-profile.schema.json`):

```json
"instagram": {
  "username": "your_handle",
  "cloneLimit": 24
}
```

**Resolution order:** `--username` → `INSTAGRAM_USERNAME` → `instagram.username` in site profile → social Instagram URL in profile.

## Usage

From the **target Astro project** (with toolkit linked or installed):

```powershell
# Uses INSTAGRAM_USERNAME from project .env
npm run ig:clone

# Or invoke the CLI directly
node ./Web_Toolkit/instagram_clone/bin/instagram-clone.mjs clone --project-root .

# Override handle for one run
node ./Web_Toolkit/instagram_clone/bin/instagram-clone.mjs clone --project-root . --username your_handle

# Verify cloned feed + assets
node ./Web_Toolkit/instagram_clone/bin/instagram-clone.mjs audit --project-root .
```

### Options

| Flag | Purpose |
|------|---------|
| `--project-root` | Target Astro site root (default: cwd) |
| `--username` | Override env/profile handle |
| `--site-profile` | Explicit `*.site-profile.json` path |
| `--limit` | Max posts (default 24) |
| `--no-download` | Write `feed.json` only; keep remote media URLs |

## Outputs

| Path | Purpose |
|------|---------|
| `src/data/instagram/feed.json` | Full captions, hashtags, mentions, album slides |
| `public/assets/instagram/profile.jpg` | Profile photo |
| `public/assets/instagram/{shortcode}*.jpg/mp4` | All album media downloaded locally |

## Feed JSON contract (per post)

- `caption` — full post text
- `captionPreview` — short grid preview
- `hashtags` / `mentions` — parsed arrays
- `slides[]` — every image/video in carousels (not just cover)
- `profile` — username, fullName, biography, profileImageUrl

Sites should treat this as **static fallback**; live Worker/cron sync reads KV first, then static clone, then empty state — never hammer Instagram on every page view.

## Agent workflow

1. Set `INSTAGRAM_USERNAME` in target `.env` and `.env.example`
2. Run `instagram-clone clone --project-root <site>`
3. Run `instagram-clone audit --project-root <site>`
4. Wire site components to read `src/data/instagram/feed.json` + `/assets/instagram/*`
5. Re-run clone before deploy or after the client posts new work

Automatic fetch backoff on rate limits: 5s → 15s → 45s → 90s.
