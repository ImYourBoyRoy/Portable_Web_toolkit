# Site Profiles

This folder is for public, non-secret example profiles only.

- `example-workers.json` demonstrates a Cloudflare Workers site.
- `example-pages.json` demonstrates a Cloudflare Pages site.

Real client/site profiles belong in the **client project root** as `<siteId>.site-profile.json` (default from `init-site-profile create --project-root .`).

Do **not** write live client profiles into this folder. Use `--site-profile <path>` to point tools at a private profile.
