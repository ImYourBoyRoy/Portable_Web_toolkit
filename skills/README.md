# Agent skills index

Install all skills once (user/global scope):

```bash
node ./scripts/install-agent-skills.mjs
```

Platform wrappers (optional):

| OS | Command |
|----|---------|
| Windows | `pwsh ./scripts/install-agent-skills.ps1 -Agent all` |
| macOS / Linux | `bash ./scripts/install-agent-skills.sh --agent all` |

Cross-platform conventions: [`CROSS_PLATFORM.md`](./CROSS_PLATFORM.md)

## Skills (invoke by name)

| Skill | Trigger |
|-------|---------|
| **portable-web-toolkit** | Default — any Astro + Cloudflare toolkit work |
| **site-starter** | New client site from scratch |
| **site-readiness** | First command every client site session |
| **toolkit-update** | Pull repo + reinstall skills + verify |
| **instagram-clone** | Public Instagram gallery (no Meta API) |

## Zero-research entry

Blind models: read repo **`START_HERE.md`** — no other files required to begin.

## Layout

```
Portable_Web_toolkit/
  START_HERE.md     ← read first
  Web_Toolkit/      ← all CLIs
  site-starter/     ← new site templates
  skills/           ← this folder
```

Client sites are **separate folders** with a `Web_Toolkit` link (junction or symlink).
