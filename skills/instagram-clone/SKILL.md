---
name: instagram-clone
description: Clones a public Instagram profile into feed.json and local media for Astro portfolio sites. Use when building Instagram galleries without Meta API tokens, setting INSTAGRAM_USERNAME, seeding static fallbacks, refreshing after 429 rate limits, or auditing feed.json.
---

# Instagram Clone

Public Instagram → local assets. **No Meta Graph API tokens.**

## Preflight

Read the client repository's applicable instructions and site profile, preserve
unrelated work, and confirm the toolkit link belongs to this project. Confirm
the operator has the right or permission to reproduce and store the selected
profile media; public availability alone is not authorization.

## When to use

- Portfolio gallery from a **public** IG account  
- Static fallback when Worker/KV sync hits 429  
- Before deploy after client posts new work  

**NOT for:** private accounts, DMs, stories-only, authenticated Meta APIs.

## Setup (client project `.env`)

```env
INSTAGRAM_USERNAME=handle_without_at
INSTAGRAM_CLONE_LIMIT=24
```

Also document in `.env.example`. Optional site profile:

```json
"instagram": { "username": "handle", "cloneLimit": 24 }
```

**Resolution order:** `--username` → `INSTAGRAM_USERNAME` → `instagram.username` in profile.

## Commands

```bash
# Clone (uses .env)
node ./Web_Toolkit/instagram_clone/bin/instagram-clone.mjs clone --project-root .

# Override handle once
node ./Web_Toolkit/instagram_clone/bin/instagram-clone.mjs clone --project-root . --username other_handle

# Verify feed + assets
node ./Web_Toolkit/instagram_clone/bin/instagram-clone.mjs audit --project-root .
```

npm script (add to client `package.json`):

```json
"ig:clone": "node ./Web_Toolkit/instagram_clone/bin/instagram-clone.mjs clone --project-root ."
```

## Outputs

| Path | Content |
|------|---------|
| `src/data/instagram/feed.json` | Posts, captions, hashtags, `slides[]`, profile |
| `public/assets/instagram/profile.jpg` | Profile photo |
| `public/assets/instagram/{shortcode}*` | Carousel media |

## Site architecture

Always keep a static `feed.json` fallback and never live-fetch Instagram on a
page request. Add KV caching, Worker cron, or a refresh endpoint only when the
repository architecture and site profile already select or authorize that
dynamic path. A static site may use manual `ig:clone` refreshes only.

## Workflow with other skills

1. **site-starter** — scaffold site  
2. Set `INSTAGRAM_USERNAME` in `.env`  
3. `instagram-clone clone` → `audit`  
4. **site-readiness** — confirms instagram step  
5. **portable-web-toolkit** — build/deploy  

## Verification

- [ ] `audit` passes  
- [ ] Gallery reads `slides[]` for carousels (not cover only)  
- [ ] No secrets in `feed.json` or git  

## Rate limits

Automatic backoff: 5s → 15s → 45s → 90s. If clone fails, site still serves last `feed.json`.
