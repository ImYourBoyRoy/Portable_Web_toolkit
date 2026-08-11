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
10a. **`WCAG_Auditor run --site-profile <profile>`** when UI accessibility evidence matters. Engine is bundled in `Web_Toolkit/wcag_auditor` only — do not resolve `AI/` trees. Init first if no config. Opt into `Site_Doctor` via `--wcag` or `diagnostics.wcagAuditor.enabled`.
11. `Integration_Doctor run --site-profile <profile>` when env/live integration readiness matters
12. `Site_Doctor run --site-profile <profile>` when broad triage is needed
13. `Headers_Deploy scaffold-public --site-profile <profile> --apply` when public/_headers cache baseline is missing
13a. `Performance_Fixes`, `Brand_Doctor` (`sync-tokens` after Brand Guide), or `Image_Pipeline` (gap-fill only — Astro Image first) only after findings justify them
13b. Confirm Astro Image posture: `OptimizedPicture` + Workers `imageService: 'compile'` (site-readiness `image-posture` step / `image-pipeline audit`)
14. `npm run build` (from profile commands.build)
14a. `Headers_Deploy write-deploy --site-profile <profile> --environment production|development` before wrangler deploy
14b. `discovery-doctor ./dist` (**fail-closed**: exit `2` on any FAIL) or `Headers_Deploy audit --site-profile <profile>` to verify discovery + built headers
14c. `Package_Updater` when dependency freshness is in scope (non-zero if registry fetch fails)
15. `PageSpeed_Diagnostics run --site-profile <profile> --strategy both` when Google PSI data is desired
15a. `PageSpeed_Diagnostics agent-batch --site-profile <profile> --routes core --strategy mobile` when an AI agent needs token-efficient PageSpeed state
15b. `PageSpeed_Diagnostics agent-diff --site-profile <profile>` when an AI agent needs a regression check
15c. `Cache_Purge warm --site-profile <profile>` (dry-run lists URLs) then `--apply` after production purge when warming matters
15d. `Site_Quality_Smoke` covers media/legal/cookies heuristics (HTML-only; pair `Browser_Diagnostics` for JS banners)
16. `Registrar_NS ping` when Porkbun credentials need verification
17. `Registrar_NS domains` to list domains and API access status
18. `Registrar_NS zone ensure --site-profile <profile> --apply` when the zone is not yet in Cloudflare
19. `Registrar_NS ns audit --site-profile <profile>` to check nameserver delegation
20. `Registrar_NS ns update --site-profile <profile> --apply` to delegate NS to Cloudflare (**MX gate**: apex MX required unless `--allow-missing-email`)
21. `cf-agent permissions audit --site-profile <profile>`
22. `cf-agent site audit --site-profile <profile>`
23. `cf-agent dns audit --site-profile <profile>`
24. `cf-agent rules audit --site-profile <profile>`
24a. `cf-agent performance audit --site-profile <profile>` when an AI agent needs Cloudflare speed-switch posture
25. `cf-agent email audit --site-profile <profile>` when email is in scope
26. `cf-agent workers verify --site-profile <profile>`
27. `cf-agent site harden --site-profile <profile>` dry-run first
28. `Headers_Deploy stack` when you need the full Cloudflare enhancement checklist
29. deploy via `cf-agent deploy pages|workers` **dry-run first**, then `--apply` (staging before prod unless waived)
30. rerun smoke after production-affecting changes; warm cache if purge was applied
31. `Verify_Portable_Toolkit` when you want the toolkit to prove its own health
32. `Purge_Portable_Toolkit --apply`, `Privacy_Check`, then export before sharing

### Mutation policy

All infrastructure/deploy mutations are **dry-run by default**. Pass `--apply` to mutate (Pages setup/add-domain, deploy pages|workers, analytics scaffold, headers write-deploy, registrar ns/zone/redirect, cache purge/warm).

### Report locations

- Client diagnostics: `<project>/output/`
- Toolkit self-checks: `Web_Toolkit/.runtime/`
