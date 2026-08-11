---
name: site-onboarding
description: Checkpoint-driven hand-holding for new machines and new Astro + Cloudflare sites using Portable Web Toolkit. Use when the user is new to Cloudflare, needs host setup, API tokens, Cloudflare MCP/plugin install, Workers vs Pages choice, or a guided site-starter scaffold. Load docs/agent-skills/ONBOARDING_STAGES.md and stop at each stage checkpoint.
---

# Site Onboarding

Follow repository path `docs/agent-skills/ONBOARDING_STAGES.md` as the source of truth (stages S0–S9). Read that file before acting; do not invent parallel onboarding steps.

## When to use

- New machine / agent environment setup
- User does not know Cloudflare well
- Creating a brand-new client site folder
- Installing Cloudflare Skills/MCP alongside the toolkit
- Guiding API token creation and `.env` wiring

## Rules

1. Read `ONBOARDING_STAGES.md` before acting.
2. Prefer full agent control; detect sandbox limits in S0.
3. Ask before host installs, Cloudflare plugin/MCP, scaffold writes, and production mutate/deploy — use the host question UI when available.
4. Global PWT footprint stays light (`portable-web-toolkit-router` only). Link heavier skills into the project with explicit `--skills`.
5. Fresh folders gaining files from `site-starter` is success, not failure.
6. Always ask **Workers vs Pages static** before scaffolding.
7. Verify Cloudflare tokens with `cf-agent permissions audit` before mutations.
8. Re-fetch https://developers.cloudflare.com/agent-setup/prompt.md live for MCP/plugin install commands.
9. **`.env` division of labor** (`site-starter/.env.example`):
   - **A (user):** `CLOUDFLARE_API_TOKEN`, `GOOGLE_PAGESPEED_API_KEY`
   - **B (agent + user):** account/zone/worker or pages names, public URL — propose and challenge
   - **C (explain early):** PostHog + GA4 — why product analytics + Google reporting matter; do not defer the conversation
   - **D (optional):** forms/Turnstile/Instagram; registrar keys only if needed (**Porkbun is an example**, not required)
10. Be curious: challenge vague names, “analytics later,” and missing required API keys before calling setup done.

## After onboarding

Hand off to `site-readiness`, then `portable-web-toolkit` for deploy/ops.
