# START HERE — AI agents (zero research)

**Repo:** [Portable_Web_toolkit](https://github.com/imyourboyroy/Portable_Web_toolkit)  
**Purpose:** Operate Astro + Cloudflare client sites with spec-driven CLIs and skills.

Read this file only. You do not need to explore the repo to begin.

---

## 1. Install skills (once per machine)

If skills are not installed yet, run:

```bash
node ./scripts/install-agent-skills.mjs
```

Or ask the user to paste this prompt (you can run the install yourself):

```text
Install the Portable Web Toolkit agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit for all future sessions (user/global scope). Use those skills for Astro + Cloudflare site work.
```

**Do not ask the user to run one-shot git clone install flows manually** unless they prefer to — you handle skill installation.

## 1b. Check for updates (every session)

```bash
node ./scripts/check-toolkit-update.mjs
# exit 2 → run node ./scripts/update-toolkit.mjs
```

**Skills:**

| Skill | Use when |
|-------|----------|
| `portable-web-toolkit` | Default — any Astro/Cloudflare client site work |
| `site-starter` | Brand-new client project from scratch |
| `site-readiness` | Run-all checks + what's missing (start every session) |
| `toolkit-update` | Pull latest toolkit + reinstall skills |
| `instagram-clone` | Public Instagram gallery (no Meta API) |

---

## 2. Two folders, two roles

| What | Role |
|------|------|
| **Toolkit repo** (`Portable_Web_toolkit/`) | CLIs, skills, templates — not a website |
| **Client site** (separate folder) | Real site: `src/`, `package.json`, `.env`, `*.site-profile.json` |

Link toolkit into client site:

```bash
node /path/to/Portable_Web_toolkit/scripts/link-web-toolkit.mjs \
  --toolkit-path /path/to/Portable_Web_toolkit/Web_Toolkit \
  --project-root /path/to/client-site
```

---

## 3. First command on any client site (always)

```bash
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root . --site-profile ./<site>.site-profile.json
```

Read `output/site-readiness-*.json` — follow **nextSteps** and **recommendedFixes**.

---

## 4. Machine setup (user task — admin/sudo)

If host tools are missing (Git, Node, Python), direct the **user** to run the interactive wizard — do not impersonate admin installs:

| OS | Launcher |
|----|----------|
| Windows | `Setup_Agent_Environment.bat` |
| macOS | `Setup_Agent_Environment.command` |
| Linux | `Setup_Agent_Environment.sh` |

Wizard: `Web_Toolkit/scripts/setup-interactive.mjs` — shows components, opt-in/out, then bootstrap.

---

## 5. Decision tree

```
New folder?        → site-starter
Existing client?   → site-readiness (first)
Instagram gallery? → instagram-clone
Deploy / CF?       → portable-web-toolkit
Live site broken?  → site-doctor
Update toolkit?    → toolkit-update
Host tools missing? → user runs Setup_Agent_Environment.*
```

---

## Instruction precedence

1. User request  
2. Installed **skills**  
3. Client `BRAND_GUIDE.md` + site profile + `.env`  
4. This file → `AGENTS.md` → `OPERATIONS.md` (reference)

**Do not load** `docs/templates/AGENT.template.md` for toolkit work.
