---
name: portable-web-toolkit-router
description: Dynamic router for Portable Web Toolkit. Inspects project needs and symlinks required agent skills into project scope (.agents/skills/). Use when starting or working on web design, Astro, or Cloudflare projects across Cursor, Claude Code, Codex, Antigravity, Copilot, etc.
---

# Portable Web Toolkit Router

Use this skill when initializing or managing skills for an Astro + Cloudflare web design project using the Portable Web Toolkit.

## Operational Sequence

1. **Check Project Scope**: Verify if `.agents/skills/` exists in the active project workspace root.
2. **Inspect Skill Index**: Read `docs/agent-skills/SKILL_INDEX.md` in the Portable_Web_toolkit repository to determine which skills this workspace requires:
   - `portable-web-toolkit` (Core: routing, Cloudflare contracts, workflow)
   - `site-readiness` (Core: auditing, pre-flight, discovery-doctor)
   - `site-starter` (Core: site creation & templates)
   - `toolkit-update` (Core: version checking & reconciliation)
   - `instagram-clone` (Optional: static fallback gallery without API keys)
   - `vectorize-pipeline` (Optional: SVG trace & font conversion)
3. **Symlink Selected Skills**:
   Run the cross-platform symlink manager from the Portable_Web_toolkit repository to link selected skills into `<project_root>/.agents/skills/`.

   Only `portable-web-toolkit-router` is `install_by_default`. Always pass `--skills` for the heavy core/optional skills you need:

   ```bash
   node <path-to-Portable_Web_toolkit>/scripts/manage-project-skills.mjs link --project . --skills portable-web-toolkit,site-readiness
   ```

4. **Verify Symlinks**:
   Run `manage-project-skills.mjs status --project .` to confirm symlinks are healthy and active.
