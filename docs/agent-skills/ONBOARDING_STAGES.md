# Onboarding stages — Portable Web Toolkit

**Canonical hand-holding protocol for AI coding agents.**  
Non-experts should be guided stage-by-stage. Do not skip checkpoints for privileged or irreversible work.

Primary entry points:

1. Root [`README.md`](../../README.md) (human paste prompt)
2. This file (stage contract)
3. Skill `site-onboarding` (loads this document)

Repo: https://github.com/imyourboyroy/Portable_Web_toolkit

---

## Checkpoint rules

After **every** stage below:

1. Summarize what was done and what evidence you have (commands, exit codes, paths).
2. **Stop and ask** before the next stage using the host’s question / confirm UI when available (Cursor popup / agent ask tools). If unavailable, ask a clear numbered question in chat.
3. Never install host software, create Cloudflare resources, mutate DNS, or deploy production without an explicit yes for that stage.
4. Prefer toolkit CLIs over inventing parallel scripts.

---

## Stage map

| Stage | Name | Outcome |
|-------|------|---------|
| **S0** | Access and sandbox | Know whether the agent can elevate / reach the network |
| **S1** | Host bootstrap | Git, Node, pyenv-native, Python, Playwright ready |
| **S2** | Toolkit and skills | Light global router + project skills linked |
| **S3** | Cloudflare account + API token | Valid `CLOUDFLARE_API_TOKEN` in project `.env`; token-audit clean |
| **S4** | Cloudflare MCP / plugin | Official Cloudflare agent skills + MCP for this IDE |
| **S5** | Site intent interview | Written choices (Workers vs Pages, domain, integrations) |
| **S6** | Scaffold site-starter | Client folder filled from templates; `Web_Toolkit` linked |
| **S7** | Env, profile, brand | Site profile + Brand Guide + secrets filled |
| **S8** | Local gates | Build + discovery-doctor + site-readiness |
| **S9** | Staging → production | Explicit prod authorization; dry-run before `--apply` |

---

## S0 — Agent access and sandbox

**Goal:** Prefer full control; detect limits early.

Check for:

- `CURSOR_SANDBOX`, `CI`, `SANDBOX`, `AGENT_SANDBOX`
- Ability to write outside the workspace
- Network access to npm / GitHub / Cloudflare
- `sudo` / UAC availability when host installs will be needed

If limited: explain what will fail and ask the user to re-run with full agent permissions or approve elevation.

**Checkpoint:** “May I proceed with host installs that may request sudo/UAC?”

---

## S1 — Host environment (macOS / Windows / Linux)

**Goal:** Install or repair the agent workstation using the toolkit bootstrap only.

```bash
# From the toolkit repo root (agent-friendly; user still enters password if needed)
bash ./Setup_Agent_Environment.sh --yes --workspace <client-or-toolkit-path>

# Windows (PowerShell 7+)
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\Web_Toolkit\scripts\setup-interactive.ps1 -Workspace . -Yes
```

Doctor / verify:

```bash
bash ./Web_Toolkit/scripts/bootstrap.sh doctor --workspace .
```

Expect: Git, Node matching `.node-version`, npm, **pyenv-native** + **pyenv-gui**, Python via pyenv (global set to latest installed desired line **and** workspace `local` venv), Playwright Chromium in that venv.

Do **not** install system / winget / Homebrew Python for toolkit work.

**Checkpoint:** Show doctor summary. Ask to continue to toolkit/skills.

---

## S2 — Toolkit and skills (light footprint)

**Goal:** Toolkit available; token cost stays low.

1. Clone or pull https://github.com/imyourboyroy/Portable_Web_toolkit (latest release).
2. Install **only** `portable-web-toolkit-router` into each agent skill home you use (`~/.cursor/skills/`, `~/.claude/skills/`, `~/.agents/skills/`, `~/.gemini/config/skills/`, `~/.codex/skills/`).
3. Purge legacy heavy PWT skills from those global homes.
4. For the active project, link explicitly:

```bash
node <toolkit>/scripts/manage-project-skills.mjs link --project <project> \
  --skills site-onboarding,portable-web-toolkit,site-readiness,site-starter,toolkit-update
```

Bare `link` without `--skills` installs **only** the router (by design).

Optional: refresh `~/.portable-web-toolkit/install-stamp.json` and `~/.local/share/portable-web-toolkit` when using a global install path.

**Checkpoint:** Confirm skill homes and project `.agents/skills/` look correct.

---

## S3 — Cloudflare account + API token

**Goal:** User creates a dashboard API token with Edit scopes; agent verifies it. Agents cannot mint dashboard tokens for the user.

### Walk the user through

1. Confirm they have a Cloudflare account and can sign in.
2. Open **My Profile → API Tokens → Create Token → Custom token**.
3. Grant **Edit** (Write) permission groups covering:

**Zone (Edit family)** — include the production zone (or all zones if they accept the risk):

- Zone Read / Zone Write / Zone Settings Write
- DNS Write
- Cache Purge
- SSL and Certificates Write
- Zone WAF Write
- Bot Management Read / Write
- Analytics Read
- Workers Routes Write
- Pages Write

**Account (Edit family)** — include their account resource:

- Workers Scripts Write
- Workers KV Storage Write
- Workers R2 Storage Write
- D1 Write
- Account Rulesets Write
- Dynamic URL Redirects Write
- **Account API Tokens Write** (needed for `cf-agent permissions repair`)

**User / API Tokens:**

- **API Tokens Write** (user-level) when the dashboard offers it — required for token self-repair flows

**Gateway (Cloudflare One) — Edit:**

- **Gateway Write** / equivalent Gateway Edit group when Zero Trust / Gateway work is in scope

Exact Cloudflare group names must match what `cf-agent` audits in `REQUIRED_PERMISSION_NAMES` (see cloudflare-agent-toolkit). Prefer listing those names to the user.

4. User pastes the token into the **client project** `.env` only:

```bash
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
CF_ZONE_NAME=
```

Never commit live tokens. Never put them only inside `Web_Toolkit/.env` for a client site.

5. Verify:

```bash
node ./Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs permissions audit --site-profile <profile>
```

If scopes are missing, guide the user to edit the token in the dashboard, or use `permissions repair --apply` **only** when the token already has API Tokens Write.

### Wrangler OAuth vs API token

- **Wrangler login / OAuth** — often enough for read-only audits.
- **`CLOUDFLARE_API_TOKEN`** — required for mutations (harden, DNS fix, deploy automation, permission repair).

**Checkpoint:** token-audit reports zero missing required permissions before any mutating Cloudflare command.

---

## S4 — Cloudflare agent plugin / MCP

**Goal:** Optional but recommended: official Cloudflare Skills + MCP for the current coding agent.

**Checkpoint first:** “May I install Cloudflare Skills and MCP servers for this agent?”

On yes:

1. Re-fetch live instructions from https://developers.cloudflare.com/agent-setup/prompt.md (do not invent stale commands).
2. Use the agent-specific path (e.g. Cursor: https://developers.cloudflare.com/agent-setup/cursor/ — `/add-plugin cloudflare` or Marketplace).
3. Distinguish clearly:
   - **Cloudflare** Skills/MCP = platform knowledge + API tools
   - **Portable Web Toolkit** skills = Astro site ops (keep global PWT light: router only)

If MCP OAuth fails: guide browser authorization; do not silently retry forever.

**Checkpoint:** User restarts the agent if required; confirm MCP tools authenticate.

---

## S5 — Site intent interview

**Goal:** Written choices before any scaffold writes.

Use [`Web_Toolkit/CHECKLIST.md`](../../Web_Toolkit/CHECKLIST.md) as the question bank. Always force early:

1. Exact new folder path (prefer empty). Approve collisions separately if the folder is not empty.
2. Production domain, registrar, whether Cloudflare already hosts DNS.
3. **Workers vs Pages static**
   - **Workers** — SSR, API routes, built-in forms, Turnstile server verify, Workers bindings (KV/D1/R2/cron)
   - **Pages static** — static HTML/assets only; no server runtime
4. Analytics, email on domain, Instagram gallery, Google PageSpeed API key availability.
5. Staging vs direct-to-prod expectations.

**Checkpoint:** Paste a short decision summary; ask “OK to scaffold?”

---

## S6 — Scaffold with site-starter

**Goal:** Fill a **fresh client folder**. That is intentional — do not treat “folder now has files” as failure.

Never scaffold inside the toolkit repo root.

1. Copy matching templates from `site-starter/` (`workers.*` or `pages.*`).
2. Copy `site-starter/.env.example` (includes `GOOGLE_PAGESPEED_API_KEY` and other API slots).
3. Link toolkit:

```bash
node <toolkit>/scripts/link-web-toolkit.mjs \
  --toolkit-path <toolkit>/Web_Toolkit \
  --project-root <site>
```

4. Copy discovery templates per `Web_Toolkit/templates/discovery/README.md`.

**Checkpoint:** List created files. Ask permission to `npm install` / `project-init apply-safe`.

---

## S7 — Env, profile, brand

1. `init-site-profile` with `deployTarget` = `workers` or `pages`.
2. Create or update project `BRAND_GUIDE.md`.
3. Fill project `.env` from `.env.example` (Cloudflare, PageSpeed, forms, Turnstile, analytics as needed).
4. Optional: `INSTAGRAM_USERNAME` only if a public gallery is wanted.

**Checkpoint:** Which secrets are still empty placeholders?

---

## S8 — Local gates

Prefer toolkit entry points:

```bash
npm install
npm run check   # if present
npm run build
npm run discovery:doctor   # Workers: ./dist/client · Pages: ./dist
npm run readiness
# optional
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs …
node ./Web_Toolkit/pagespeed_diagnostics/bin/pagespeed-diagnostics.mjs …
node ./Web_Toolkit/package_updater/bin/package-updater.mjs run --project-root .   # TS capped at 6.x
```

**Discovery paths:** Workers → `./dist/client`; Pages static → `./dist`.

**Checkpoint:** Review readiness / doctor reports before deploy.

---

## S9 — Staging → smoke → production

Follow [`Web_Toolkit/OPERATIONS.md`](../../Web_Toolkit/OPERATIONS.md):

1. Deploy staging / preview when available.
2. Smoke (quality smoke, site-doctor as needed).
3. Live discovery pass on staging URL.
4. Cloudflare mutations: **audit → dry-run → `--apply`** only with authorization.
5. Production deploy only after explicit production yes.
6. Production smoke + live discovery-doctor.

**Headers / CSP:** run `headers-deploy` for the target environment before first prod when using toolkit headers.

**Checkpoint:** Explicit “authorize production deploy / apply?”

---

## Additional guidance (do not skip when relevant)

| Topic | Instruction |
|-------|-------------|
| Registrar / DNS cutover | Porkbun keys in `.env`; registrar dry-run before NS change |
| Email on domain | Check MX; warn before zone harden / orange-cloud proxy that can break mail |
| Headers / CSP | `headers-deploy` before first production publish |
| WCAG | Bundled `Web_Toolkit/wcag_auditor` only; install Playwright peers in the **client** project |
| Instagram | Optional skill; only with user consent + `INSTAGRAM_USERNAME` |
| package-updater | Latest floors; TypeScript stays `^6.0.3` until `@astrojs/check` peers allow 7 |
| Privacy / export | `privacy-check` + `toolkit-purge` before sharing a toolkit copy |
| Multi-agent homes | PWT router globally per agent; Cloudflare plugin optional per agent; do not dump heavy PWT skills into global homes |

---

## Related docs

- [`README.md`](../../README.md) — paste prompt for humans
- [`getting-started.md`](./getting-started.md) — skills install notes (points at README)
- [`SKILL_INDEX.md`](./SKILL_INDEX.md) — which skill to load
- [`site-starter/README.md`](../../site-starter/README.md) — Workers vs Pages file map
- [`Web_Toolkit/Setup_agent_environment/README.md`](../../Web_Toolkit/Setup_agent_environment/README.md) — host bootstrap
- [`Web_Toolkit/cloudflare-agent-toolkit/README.md`](../../Web_Toolkit/cloudflare-agent-toolkit/README.md) — `cf-agent` / token-audit
