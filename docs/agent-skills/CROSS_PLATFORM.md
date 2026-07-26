# Cross-platform conventions

Portable Web Toolkit targets Windows, macOS, and Linux. Toolkit CLIs use the
Node version declared in `.node-version` and the root package engine.

## Status and maintenance

```bash
node ./scripts/check-agent-skills.mjs --agent cursor
node ./scripts/check-toolkit-update.mjs
```

PowerShell and bash compatibility wrappers are read-only. Installation and
replacement follow [`INSTALL_PROTOCOL.md`](./INSTALL_PROTOCOL.md).

## Link the toolkit into a client project

```bash
node /path/to/Portable_Web_toolkit/scripts/link-web-toolkit.mjs \
  --toolkit-path /path/to/Portable_Web_toolkit/Web_Toolkit \
  --project-root /path/to/client-site \
  --name Web_Toolkit
```

Manual alternatives are a Windows junction or a macOS/Linux symbolic link.
Resolve and inspect either target before replacing it.

Use forward slashes in Node arguments where practical. Secrets belong in the
client project environment, never in a shared skill.
