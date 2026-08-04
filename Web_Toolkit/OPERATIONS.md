# Portable Toolkit Operations

> **Agents:** run `site-readiness run` first and follow `output/site-readiness-*.json`. Use this file as the full reference checklist — not as the primary navigation path.

## Canonical sequence

1. `Setup_Agent_Environment` (new machine only)
2. **`Site_Readiness run --project-root <path>`** — **start every client session here** (sandbox-aware run-all + next steps)
3. `Project_Init apply-safe --project-root <path>` when readiness reports missing starter files (or use `--apply-safe-fixes` on site-readiness)
4. `Init_Site_Profile` when no site profile exists yet
5. `Toolkit_Report generate --project-root <path>` only when readiness is inconclusive
6. `Setup_Astro_Environment --project-root <path> --site-profile <profile>`
7. `Preview_Local_Site` when local review matters
8. `Preview_Smoke` when local auto-probe matters
9. `Site_Quality_Smoke run --site-profile <profile>` when live posture matters
10. `Browser_Diagnostics run --site-profile <profile>` when real-browser behavior matters
10a. **`WCAG_Auditor run --site-profile <profile>`** when UI accessibility evidence matters. Bridge to standalone `@roydawsoniv/wcag-auditor` (`AI/wcag-auditor`). Init first if no config. Opt into `Site_Doctor` via `--wcag` or `diagnostics.wcagAuditor.enabled`. For non-website apps, call the standalone package directly.
11. `Integration_Doctor run --site-profile <profile>` when env/live integration readiness matters
12. `Site_Doctor run --site-profile <profile>` when broad triage is needed
13. `Headers_Deploy scaffold-public --site-profile <profile> --apply` when public/_headers cache baseline is missing
13a. `Performance_Fixes`, `Brand_Doctor`, or `Image_Pipeline` only after findings justify them
14. `npm run build` (from profile commands.build)
14a. `Headers_Deploy write-deploy --site-profile <profile> --environment production|development` before wrangler deploy
14b. `Headers_Deploy audit --site-profile <profile>` or `discovery-doctor ./dist` to verify built headers
15. `PageSpeed_Diagnostics run --site-profile <profile> --strategy both` when Google PSI data is desired
15a. `PageSpeed_Diagnostics agent-batch --site-profile <profile> --routes core --strategy mobile` when an AI agent needs token-efficient PageSpeed state
15b. `PageSpeed_Diagnostics agent-diff --site-profile <profile>` when an AI agent needs a regression check
16. `Registrar_NS ping` when Porkbun credentials need verification
17. `Registrar_NS domains` to list domains and API access status
18. `Registrar_NS zone ensure --site-profile <profile> --apply` when the zone is not yet in Cloudflare
19. `Registrar_NS ns audit --site-profile <profile>` to check nameserver delegation
20. `Registrar_NS ns update --site-profile <profile> --apply` to delegate NS to Cloudflare
21. `cf-agent permissions audit --site-profile <profile>`
22. `cf-agent site audit --site-profile <profile>`
23. `cf-agent dns audit --site-profile <profile>`
24. `cf-agent rules audit --site-profile <profile>`
24a. `cf-agent performance audit --site-profile <profile>` when an AI agent needs Cloudflare speed-switch posture
25. `cf-agent email audit --site-profile <profile>` when email is in scope
26. `cf-agent workers verify --site-profile <profile>`
27. `cf-agent site harden --site-profile <profile>` dry-run first
28. `Headers_Deploy stack` when you need the full Cloudflare enhancement checklist
29. deploy dev before prod unless explicitly told otherwise
30. rerun smoke after production-affecting changes
31. `Verify_Portable_Toolkit` when you want the toolkit to prove its own health
32. `Purge_Portable_Toolkit --apply`, `Privacy_Check`, then export before sharing
