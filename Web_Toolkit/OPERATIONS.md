# Portable Toolkit Operations

## Canonical sequence

1. `Setup_Agent_Environment`
2. `Project_Init audit --project-root <path>` when the target project is fresh, partial, or uncertain
3. `Project_Init apply-safe --project-root <path>` when you want missing starter files created without overwriting existing work
4. `Init_Site_Profile` when no site profile exists yet
5. `Toolkit_Report generate --project-root <path>` when the current project phase is unclear
6. `Setup_Astro_Environment --project-root <path> --site-profile <profile>`
7. `Preview_Local_Site` when local review matters
8. `Preview_Smoke` when local auto-probe matters
9. `Site_Quality_Smoke run --site-profile <profile>` when live posture matters
10. `Browser_Diagnostics run --site-profile <profile>` when real-browser behavior matters
11. `Integration_Doctor run --site-profile <profile>` when env/live integration readiness matters
12. `Site_Doctor run --site-profile <profile>` when broad triage is needed
13. `Performance_Fixes`, `Brand_Doctor`, or `Image_Pipeline` only after findings justify them
14. `PageSpeed_Diagnostics run --site-profile <profile> --strategy both` when Google PSI data is desired
14a. `PageSpeed_Diagnostics agent-batch --site-profile <profile> --routes core --strategy mobile` when an AI agent needs token-efficient PageSpeed state
14b. `PageSpeed_Diagnostics agent-diff --site-profile <profile>` when an AI agent needs a regression check
15. `Registrar_NS ping` when Porkbun credentials need verification
16. `Registrar_NS domains` to list domains and API access status
17. `Registrar_NS zone ensure --site-profile <profile> --apply` when the zone is not yet in Cloudflare
18. `Registrar_NS ns audit --site-profile <profile>` to check nameserver delegation
19. `Registrar_NS ns update --site-profile <profile> --apply` to delegate NS to Cloudflare
20. `cf-agent permissions audit --site-profile <profile>`
21. `cf-agent site audit --site-profile <profile>`
22. `cf-agent dns audit --site-profile <profile>`
23. `cf-agent rules audit --site-profile <profile>`
23a. `cf-agent performance audit --site-profile <profile>` when an AI agent needs Cloudflare speed-switch posture
24. `cf-agent email audit --site-profile <profile>` when email is in scope
25. `cf-agent workers verify --site-profile <profile>`
26. `cf-agent site harden --site-profile <profile>` dry-run first
27. deploy dev before prod unless explicitly told otherwise
28. rerun smoke after production-affecting changes
29. `Verify_Portable_Toolkit` when you want the toolkit to prove its own health
30. `Purge_Portable_Toolkit --apply`, `Privacy_Check`, then export before sharing
