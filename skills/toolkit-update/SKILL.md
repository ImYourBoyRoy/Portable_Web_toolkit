---
name: toolkit-update
description: Compare, plan, or apply Portable Web Toolkit or toolkit-skill updates. Use when asked to inspect freshness, reconcile a local export with GitHub, inspect installed skill versions, or review an update. Normal toolkit commands perform a guarded, throttled freshness preflight; this skill handles manual review and reconciliation.
---

# Toolkit Update

Establish current state before choosing an update.

## Preflight

Resolve the active repository and applicable instructions, preserve unrelated
work, then locate the actual toolkit source and selected client skill roots.

## Inspect

1. Resolve the toolkit root and determine whether it is a real Git worktree, an
   export, a cache, or a linked client copy.
2. Read `VERSION`, package versions, `skill-pack.json`, Git status, current
   commit and remote, when available.
3. Inspect the selected upstream release, tag, or immutable commit.
4. Compare skill directories, versions, hashes, toolkit modules, templates,
   instructions, and release notes.
5. Classify local-only, upstream-only, modified, generated, and ignored content.
6. Report the status. The automatic preflight may apply only the guarded fast-forward and WCAGate refresh described below; manual reconciliation still stops unless explicitly authorized.

Before reporting a Git remote, remove URL userinfo, credentials, query strings,
and fragments. Describe private-fork locations generically unless the exact
locator is necessary and authorized.

Use the optional status helper only as an aid:

```bash
node ./scripts/check-agent-skills.mjs --agent <client> --scope <user-or-project>
```

It must not be required for an agent-driven installation.

## Plan

Prefer an upstream-backed Git worktree. For an exported local folder:

1. create a recoverable backup
2. clone the selected upstream source into staging
3. port reviewed local-only capabilities without dependencies or caches
4. resolve instruction and manifest changes
5. validate in staging
6. switch the active path only after review

Never claim that `git pull` updated an export without `.git`.

## Apply

For manual source reconciliation, require exact update authorization. Use
`git pull --ff-only` only when the worktree and branch permit it. Otherwise use
a staging clone and explicit reconciliation. Normal command-time freshness uses
the same clean-main/fast-forward gate and never overwrites local changes.

Do not:

- run an unaudited remote installer
- overwrite unmanaged or locally modified skills
- reinstall every client as a side effect
- delete a local-only module merely because upstream lacks it
- install host software, push, tag, publish, or deploy without separate approval

### WCAGate engine (independent of toolkit VERSION)

The toolkit automatically checks the unpinned public `main` head at most once
per 24 hours. It refreshes the ignored `Web_Toolkit/node_modules` install when
the remote head changes and writes the result to
`Web_Toolkit/.runtime/toolkit-auto-update.json`. Set
`PORTABLE_TOOLKIT_AUTO_UPDATE=0` to disable the preflight.

After a toolkit `git pull`, refresh the accessibility engine without bumping toolkit `VERSION`:

```bash
cd Web_Toolkit
npm run wcagate:update
node ./wcag_auditor/bin/wcag-auditor.mjs core-path
# → …/Web_Toolkit/node_modules/@imyourboyroy/wcagate
```

Or `node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs doctor --update-engine`. That reinstalls the GitHub spec (`npm update` does not refetch unpinned git deps). npm 12+ needs `--allow-git=all` (shipped in `Web_Toolkit/.npmrc`). Do not clone `AI/wcag-auditor`.

### Upgrading to Dynamic Symlinked Skill Architecture

When upgrading an existing install to v0.3.2+:
1. Purge legacy heavy web skills (`instagram-clone`, `portable-web-toolkit`, `site-readiness`, `site-starter`, `toolkit-update`, `vectorize-pipeline`) from global home skill directories (`~/.gemini/config/skills/`, `~/.cursor/skills/`, `~/.claude/skills/`).
2. Copy `skills/portable-web-toolkit-router` into global home skill discovery directories.
3. Run `node scripts/manage-project-skills.mjs link --project . --skills portable-web-toolkit,site-readiness,site-starter,toolkit-update` to symlink selected skills into active project scope (`.agents/skills/`). Bare `link` without `--skills` only installs the light `portable-web-toolkit-router`.

## Verify

Run:

- skill manifest validation
- structural validation for every skill
- positive and near-miss routing tests when available
- toolkit verification and privacy checks
- status comparison for selected installed clients

Report the previous and resulting versions, source commit, preserved local
capabilities, files changed, installed skills left untouched, checks, rollback
location, and unresolved publication work.
