# Architecture & Ingestion Guide — Portable Web Toolkit

This document provides a succinct, high-density overview of the **Portable Astro + Cloudflare Web Toolkit** for rapid ingestion by AI coding agents (**Antigravity, Cursor, Claude Code, Codex, Copilot, etc.**).

---

## 1. System Topology & Directory Map

```
Portable_Web_toolkit/
  ├── README.md                      ← Primary human & model introduction
  ├── START_HERE.md                  ← Fast orientation for AI agents
  ├── ARCHITECTURE.md                ← High-density system map (this file)
  ├── AGENTS.md                      ← Governance and operator contracts
  ├── MEMORY.md                      ← Living project memory & snapshot
  ├── VERSION                        ← Single source of truth for version tag
  │
  ├── skills/                        <-- Master source of all Agent Skills
  │   ├── portable-web-toolkit-router/ <-- Minimalist Global Launcher (~60 tokens)
  │   ├── portable-web-toolkit/      <-- Core Astro/Cloudflare workflow
  │   ├── site-readiness/            <-- Pre-flight auditing & gates
  │   ├── site-starter/              <-- Scaffolding templates
  │   ├── toolkit-update/            <-- Version sync & reconciliation
  │   ├── instagram-clone/           <-- Static fallback gallery
  │   └── vectorize-pipeline/        <-- SVG vector trace candidate prep
  │
  ├── scripts/                       <-- Cross-platform maintenance tools
  │   ├── manage-project-skills.mjs  <-- Symlink manager (.agents/skills/)
  │   ├── check-agent-skills.mjs   <-- Skill status & digest checker
  │   ├── validate-skills.mjs        <-- Governance validation gate
  │   └── sync-readme-versions.mjs   <-- Version table auto-syncer
  │
  ├── docs/agent-skills/             <-- Skill docs & selection matrix
  │   └── SKILL_INDEX.md             <-- Fast-lookup skill selection matrix
  │
  └── Web_Toolkit/                   <-- Executable CLI tool suites
      ├── site_readiness/            <-- Session orchestrator (JSON next steps)
      ├── project_init/              <-- Non-destructive project bootstrapper
      ├── cloudflare-agent-toolkit/  <-- CF audit, deploy, DNS, hardening
      ├── discovery_doctor/          <-- robots/sitemap/llms/JSON-LD auditor
      ├── headers_deploy/            <-- public/_headers scaffold & deploy
      ├── privacy_check/             <-- Leak & secret scanner
      └── shared/lib/                <-- Shared env, profile, and path helpers
```

---

## 2. Dynamic Symlink Skill Architecture

```
[Global Scope] (~/.gemini/config/skills/ or ~/.cursor/skills/)
  └── portable-web-toolkit-router/ (~60 tokens idle cost)
        │
        ▼ (Inserts SKILL_INDEX.md matrix, runs manage-project-skills.mjs)
┌────────────────────────────────────────────────────────────────────────┐
│ Client Project: <client_project_root>/                                 │
│  └── .agents/skills/                                                   │
│      ├── portable-web-toolkit ───> Portable_Web_toolkit/skills/...    │
│      └── site-readiness ─────────> Portable_Web_toolkit/skills/...    │
└────────────────────────────────────────────────────────────────────────┘
```

* **Context Hygiene**: Unrelated projects (Python, Rust, C++) pay **< 60 tokens** idle context cost.
* **Instant Live Updates**: Running `git pull` in `Portable_Web_toolkit` automatically updates all client project symlinks live.
* **Universal Standard**: `.agents/skills/` is supported out-of-the-box across all AI coding tools.

---

## 3. Core Operational Workflows

1. **New Site Scaffolding**:
   `node ./Web_Toolkit/project_init/bin/project-init.mjs apply-safe --project-root <dir>`  
   *(Scaffolds `README`, `MEMORY`, `.env.example`, `.gitignore`, and symlinks `.agents/skills/`)*

2. **Pre-Flight Readiness Audit**:
   `node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root <dir>`

3. **Discovery Layer Audit**:
   `node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs <distPath>`

4. **Privacy & Secrets Scan**:
   `node ./Web_Toolkit/privacy_check/bin/privacy-check.mjs scan --root .`

5. **Full Repository Validation**:
   `npm run validate`
