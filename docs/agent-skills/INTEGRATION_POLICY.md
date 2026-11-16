# Integration policy: build, adopt, or replace

The toolkit manages the repeatable parts of building a site. Tools and plugins from outside are welcome **when they do a
job better than we would**; nothing here is permanent, and any adopted tool can be replaced when a better one appears.

## Before building a capability

1. Check what exists: the toolkit (`docs/TOOLS.md` is the index), installed skills/plugins, then the plugin catalog
   (`SearchPlugins`) and well-known libraries. Do not reinvent a markdown parser, a PDF writer, or an image encoder.
2. Score a candidate on: **runs locally** (does page content, source, or secrets leave the machine?), **maintenance**
   (publisher, last release), **overlap** with something we already have, **cost/limits**, and **fit** (output a model can
   use without re-reading pages of text).
3. Decide and record it in the table below (adopt / decline / watch) with the reason. A future model reading the table
   should not have to re-derive the decision, and the user can overturn it.

## Rules of thumb

- **Local beats remote** for client work. A remote service is acceptable only for public content the client agreed to share.
- **Adopt and wrap** when the tool is good but its output is noisy: keep the tool, add a thin adapter (WCAGate wraps axe-core;
  the toolkit wraps WCAGate). Engines live in their own repos and install as a semver range.
- **Build** only the part that is specific to this stack (site profiles, Cloudflare workflows, theme tokens, templates).
- **Replace** freely: when a better tool arrives, swap it, update the row, and keep the old tool's decision note.

## Decisions

| Capability | Tool | Decision | Why | Revisit when |
|---|---|---|---|---|
| Accessibility gate | WCAGate (axe-core + Playwright) | adopt (ours) | local, fail-closed, grouped report | - |
| Remote a11y scan (Deque Axe MCP) | plugin | decline | runs in Deque's cloud; page content leaves the machine | a fully local mode exists |
| Browser automation for agents | built-in browser | adopt | visible, user can take over, keeps sign-ins | - |
| Playwright MCP | plugin | decline | no gain over built-in browser here; Playwright already a dependency | multi-browser traces needed by an agent without a browser |
| Cloudflare | cf-agent API (per-project token) + Cloudflare plugin | adopt both | API for mutations across accounts, plugin for docs/read-only (see MCP_INTEGRATIONS.md) | - |
| Svelte code help | Svelte MCP | adopt | official docs + autofixer | - |
| On-page SEO checks | `preview-check seo` | build | deterministic, grouped output | - |
| Keyword/content strategy | none yet | defer | marketing concern; needs Search Console data | build as a separate package in the WCAGate mold |
| Dependency upgrades | `package-updater` | build | peer-aware, verified, rollback; no equivalent verifies and restores | a tool with the same guarantees |
| Markdown / documents | existing libraries and the docs/office skills | adopt | do not reinvent | - |
