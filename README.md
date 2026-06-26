# Portable Web Toolkit

**Version:** `0.2.5` · [GitHub](https://github.com/imyourboyroy/Portable_Web_toolkit) · [MIT License](./LICENSE)

A toolkit for building and shipping **Astro + Cloudflare** websites with help from AI coding agents (Cursor, Claude, Copilot, and others).

You get ready-made **agent skills**, **command-line tools** for build/deploy/discovery, and **starter templates** for new sites. Your actual website lives in its own project folder — not in this repo.

---

## Get started (use your AI agent)

Paste this into your coding agent **once per machine**:

```text
Install the Portable Web Toolkit agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit for all future sessions (user/global scope). Use those skills for Astro + Cloudflare site work. On any client site, run site-readiness first and follow its report.
```

The agent installs the skills and runs toolkit commands for you. **You do not need to run install scripts yourself** unless you want to.

### Working on a site

Tell your agent something like:

```text
Use the portable-web-toolkit skills on this project. Run site-readiness and fix anything it reports before we build or deploy.
```

Each client site is a **separate folder** with its own `package.json`, `.env`, and site profile. Link this toolkit’s `Web_Toolkit/` into that folder (your agent can do this with `scripts/link-web-toolkit.mjs`).

---

## Optional: prepare your computer

On a **new machine**, you may need Git, Node.js, Python, or browser automation tools. Run the **interactive setup wizard** — it lists everything, lets you opt in or out, then installs only what you chose.

| Platform | Run |
|----------|-----|
| **Windows** | Double-click [`Setup_Agent_Environment.bat`](./Setup_Agent_Environment.bat) |
| **macOS** | Double-click [`Setup_Agent_Environment.command`](./Setup_Agent_Environment.command) or run `./Setup_Agent_Environment.sh` |
| **Linux** | `bash ./Setup_Agent_Environment.sh` |

Administrator (Windows) or `sudo` (macOS/Linux) may be required. See [`Web_Toolkit/Setup_agent_environment/README.md`](./Web_Toolkit/Setup_agent_environment/README.md) for details.

**pyenv-native** — included in core setup — is a modern Rust-based Python version manager. It replaces classic pyenv on macOS/Linux and adds first-class Python management on Windows (where traditional pyenv is not officially supported).

---

## What’s in this repo

| Path | Purpose |
|------|---------|
| [`skills/`](./skills/README.md) | Agent skills — install once, use in every session |
| [`Web_Toolkit/`](./Web_Toolkit/README.md) | CLI tools (readiness, deploy, discovery, Cloudflare, etc.) |
| [`site-starter/`](./site-starter/README.md) | Templates to bootstrap a new client site |
| [`START_HERE.md`](./START_HERE.md) | Short guide for AI agents (zero research) |

---

## Common tasks (for you or your agent)

| Goal | What to ask or run |
|------|-------------------|
| Check a site before deploy | `site-readiness` on the client project |
| New site from scratch | `site-starter` skill + copy templates |
| Public Instagram gallery | `instagram-clone` skill (`INSTAGRAM_USERNAME` in `.env`) |
| Update toolkit + skills | `toolkit-update` skill or `node scripts/update-toolkit.mjs` |
| Verify discovery layer | `discovery-doctor` on `dist/` or live URL |

Full CLI list: [`Web_Toolkit/README.md`](./Web_Toolkit/README.md) or the `portable-web-toolkit` skill.

---

## Configuration

| What | Where |
|------|-------|
| API keys and secrets | **Client project** root `.env` (never commit) |
| Domains, worker names, deploy commands | `*.site-profile.json` in the client project |
| Brand colors, voice, logos | Client `BRAND_GUIDE.md` |
| Session notes and project memory | Client project `MEMORY.md` (not in this toolkit repo) |

---

## Documentation

| Doc | For |
|-----|-----|
| [`START_HERE.md`](./START_HERE.md) | AI agents |
| [`skills/CROSS_PLATFORM.md`](./skills/CROSS_PLATFORM.md) | Windows / macOS / Linux notes |
| [`Web_Toolkit/OPERATIONS.md`](./Web_Toolkit/OPERATIONS.md) | Build and deploy sequence |
| [`docs/agent-skills/`](./docs/agent-skills/README.md) | Per-agent skill install notes |

## Requirements

- **Node.js 26+** (see `.node-version` in this repo)
- Client sites: Astro 7 + Cloudflare (Workers or Pages) — templates in [`site-starter/`](./site-starter/README.md)

---

## Author

**Roy Dawson IV** · [@imyourboyroy](https://github.com/imyourboyroy)

Client names, domains, and branding belong in each project’s site profile — not in this repository.
