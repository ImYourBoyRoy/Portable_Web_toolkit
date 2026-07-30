# Agent Skills Index — Portable Web Toolkit

This index is the fast-lookup manifest used by AI coding agents (**Antigravity, Cursor, Claude Code, Codex, Copilot, etc.**) to inspect available skills and symlink only the necessary skills into a client project's `.agents/skills/` directory.

---

## Skill Selection Matrix

| Skill Name | Tier | Purpose & Selection Criteria | Primary Use-Case | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **`portable-web-toolkit`** | `core` | **Master Workflow Router**: Operational rules, Cloudflare Workers/Pages contracts, site profile management, and build workflow. | Any Astro + Cloudflare project managed by the toolkit. | None |
| **`site-readiness`** | `core` | **Auditing & Gates**: Runs automated readiness checks, discovery doctor, linting, build gates, and pre-deploy verification. | Pre-flight check before build/staging/deploy. | `portable-web-toolkit` |
| **`site-starter`** | `core` | **Site Scaffolding**: Bootstraps brand-new Astro + Cloudflare client sites from starter templates. | Initializing a new client site directory. | None |
| **`toolkit-update`** | `core` | **Reconciliation & Version Sync**: Compares client site / toolkit checkout with source releases and reconciles versions. | Upgrading or auditing toolkit health. | None |
| **`portable-web-toolkit-router`** | `core` | **Minimalist Router**: Global launcher skill that inspects project needs and symlinks required skills into `.agents/skills/`. | Initializing skills in a project workspace. | None |
| **`instagram-clone`** | `optional` | **Static Gallery Fallback**: Clones public Instagram profile posts into local `feed.json` and static WebP media for Astro galleries without API tokens. | Client site requiring Instagram feed gallery. | `portable-web-toolkit` |
| **`vectorize-pipeline`** | `optional` | **SVG Candidate Prep**: Converts licensed font wordmarks (from TTF/OTF) or high-contrast rasters to clean, crisp SVG outlines. | Logo & vector asset preparation. | None |

---

## Universal Symlink Symbiosis (`.agents/skills/`)

All AI coding tools (Antigravity, Cursor, Claude Code, Codex, Gemini CLI, Copilot) support `.agents/skills/` at the project workspace root.

To link selected skills into a client project:

```bash
# Link core skills (default)
node /home/v1x0r/Desktop/AI/WebDesign/Portable_Web_toolkit/scripts/manage-project-skills.mjs link --project /path/to/client-site

# Link specific skills (e.g. core + instagram-clone)
node /home/v1x0r/Desktop/AI/WebDesign/Portable_Web_toolkit/scripts/manage-project-skills.mjs link --project /path/to/client-site --skills portable-web-toolkit,site-readiness,instagram-clone

# Check active symlinks
node /home/v1x0r/Desktop/AI/WebDesign/Portable_Web_toolkit/scripts/manage-project-skills.mjs status --project /path/to/client-site
```

### Why Symlinks?
1. **Zero Context Waste**: Unrelated projects (Python, Rust, C++) do not load web skills into system prompt context.
2. **Instant Live Updates**: Running `git pull` in `Portable_Web_toolkit` automatically updates all linked client projects. No stale file drift.
3. **Cross-Platform**: Automatically uses POSIX directory symlinks on Linux/macOS and Directory Junctions on Windows (`pwsh`).
