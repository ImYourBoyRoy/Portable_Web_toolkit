# Init Site Profile

Use this tool to create a new portable site profile after the AI gathers the missing information from the user.

## Commands

- `init-site-profile requirements`
- `init-site-profile create --site-id ... --project-root ... --deploy-target workers|pages --zone ... --prod-hosts ... --dev-hosts ...`

## Purpose

This is not meant to replace the AI conversation. The AI should use the `requirements` output as a checklist, ask the user for anything missing, and then write the profile with `create`.

Typical flow:

1. Run `init-site-profile requirements`
2. Ask the user only for missing items
3. Create the profile
4. Run `astro-env-setup doctor` and `cf-agent site audit` against the new profile
