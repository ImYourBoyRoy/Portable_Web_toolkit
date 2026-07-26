# Cursor setup (Portable Web Toolkit)

See [docs/agent-skills/cursor.md](./agent-skills/cursor.md) and [docs/agent-skills/README.md](./agent-skills/README.md).

Check project-scope status without changing files:

```powershell
./scripts/install-agent-skills.ps1 -Agent cursor -Scope project
```

The bash wrapper accepts `--agent cursor --scope project`. Both wrappers are
read-only compatibility entrypoints. For an authorized installation or update,
follow [the agent installation protocol](./agent-skills/INSTALL_PROTOCOL.md).
