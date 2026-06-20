# Portable Toolkit Runbooks

## Incident triage

Use this when the site, build path, or deploy path is unstable and root cause is not yet localized.

### Safe triage order

1. `Setup_Agent_Environment`
2. `Setup_Astro_Environment doctor`
3. `Preview_Smoke`
4. `Site_Quality_Smoke`
5. `Integration_Doctor`
6. `Site_Doctor`
7. Cloudflare sub-audits only after the basics are confirmed

### Symptom map

- **Site down everywhere** → worker/pages deploy, DNS, SSL, routes, rules
- **Preview works but live fails** → Cloudflare deploy, routes, DNS, rules/headers
- **Prod works, dev fails** → dev host, dev route, dev config mismatch
- **Forms or analytics missing** → project root `.env`, integration markers, script loading
- **Mail fails after DNS work** → MX/SPF/DKIM/DMARC or provider cutover drift

### Triage rules

- prefer audit → diagnose → smallest safe fix
- stop adding new changes until the blast radius is understood
- if a recurring failure mode appears, add a reusable helper instead of leaving only ad-hoc notes

## Rollback response

Use this when a deploy, DNS change, or rule/header change created production risk.

### Priority order

1. stabilize user impact
2. stop adding changes
3. capture diagnostics before destructive rollback
4. roll back the smallest safe layer first

### First response checklist

- run `Site_Doctor.bat run --site-profile <profile>` when possible
- save the latest JSON + Markdown reports from the target project's `output/` folder
- confirm whether the issue is local build/runtime, deploy, DNS, rules/headers/cache, or a third-party integration
- if the blast radius is unclear, stay in audit-only mode first

### Rollback lanes

#### Local rollback
- use when preview/build verification failed before publish
- rerun `astro-env-setup verify`
- rerun `astro-env-setup preview-smoke`
- revert the smallest recent local change set

#### Deploy rollback
- use when a live publish introduced breakage
- confirm the failure with smoke checks
- republish the last known-good environment/config
- rerun `cf-agent workers verify` or the Pages equivalent checks

#### Rules / headers / cache rollback
- run `cf-agent rules audit --site-profile <profile>`
- run `site-quality-smoke run --site-profile <profile>`
- compare the latest two reports when possible
- revert only the changed rule/header layer causing the regression
- purge targeted cache entries only if stale edge content is part of the issue

#### DNS rollback
- run `cf-agent dns audit --site-profile <profile>`
- run `cf-agent dns public --site-profile <profile>`
- compare expected profile records vs public resolver views
- restore the previous record state only when the prior good state is known

### Escalate instead of forcing changes when

- DNS propagation is still actively converging
- mailbox continuity is uncertain
- SSL/origin state is unknown
- a rollback would destroy user data or identity bindings
