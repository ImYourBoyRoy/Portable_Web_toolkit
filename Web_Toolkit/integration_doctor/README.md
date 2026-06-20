# Integration Doctor

Checks the project `.env` / `.env.example` posture and validates common live integrations so an AI agent can confirm whether analytics, forms, email, auth, and Cloudflare token setup are ready before publish.

## Usage

```bash
node ./bin/integration-doctor.mjs run --site-profile ../site-profiles/example-workers.json --project-root /path/to/project
```

## What it checks

- project root `.env.example` presence
- project root `.env` presence
- whether required env keys exist
- whether required env keys are documented in `.env.example`
- whether required site secrets exist only in an optional `Web_Toolkit/.env` instead of the project root `.env`
- live integration markers for:
  - GA4
  - PostHog
  - Web3Forms
  - Passkey/WebAuthn
- latest email audit warnings when transactional email is in scope
- Cloudflare token source visibility

## Outputs

Writes JSON + Markdown reports into the target project's `output/` folder.


