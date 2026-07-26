# Client skill smoke matrix

Structural validation is automated. Runtime activation must also be checked
against supported client releases before publishing a skill-pack release.

| Client | Discovery location | Positive case | Near-miss case | Result evidence |
|---|---|---|---|---|
| Codex | client-native skill directory | Router activates for a toolkit-managed Astro + Cloudflare project | Router stays inactive for an unrelated repository | Record client version and transcript |
| Cursor | `.cursor/skills/` | Explicit toolkit readiness request discovers `site-readiness` | Generic readiness wording does not seize unrelated work | Record client version and transcript |
| Claude Code | `.claude/skills/` or plugin | Explicit skill invocation loads only the requested workflow | Ordinary website edit does not trigger maintenance | Record client version and transcript |
| Antigravity | supported plugin or skills root | Toolkit-managed site request discovers the router | Generic Astro question does not imply toolkit management | Record client version and transcript |

Use [`activation-cases.json`](./activation-cases.json) as the stable fixture.
Do not claim runtime support from file-layout validation alone.
