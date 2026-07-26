# Agent-driven skill installation protocol

This protocol is the primary installation path. It does not require a toolkit
installer application. Optional scripts report status only.

## Resolve source

1. Select a tagged release or immutable commit.
2. Fetch it into a temporary directory without executing repository scripts.
3. Read `skill-pack.json`.
4. Validate the manifest and selected skill trees.
5. Confirm the client and scope from current first-party documentation.

Do not assume one client root covers a separate CLI or editor product.
Inspect every discovery root the selected client supports. A shared
`.agents/skills/` copy may already satisfy Codex, Cursor, and Antigravity at
project scope; do not add client-specific duplicates without a reason.

## Inspect before changing

For every selected skill, classify the destination:

- `current`: version metadata and content match
- `missing`: no destination exists
- `different`: package metadata exists but content or version differs
- `unmanaged-or-legacy`: same-name directory lacks package metadata
- `unsafe-tree`: contains a symlink, junction, reparse point, or special file
- `conflict`: destination is not an ordinary directory

Default to reporting this table. An explicit installation or update request is
required before mutation.

Never overwrite `different`, `unmanaged-or-legacy`, `unsafe-tree`, or `conflict`
without a separate, exact adoption or replacement decision.

If the same skill is discoverable from multiple roots, report every copy and
resolve precedence before updating any of them.

## Prepare a transaction

1. Resolve every target before copying.
2. Reject source and destination trees containing nested links or special files.
3. Stage every selected skill outside its discovery directory but on the same
   filesystem.
4. Verify staged versions, hashes, frontmatter, links, and ordinary-file types.
5. Create backups and a transaction receipt outside all discovery directories.
6. Record target, previous state, previous digest, source version, source
   commit, staged digest, and recovery location.

Do not begin replacement until every selected client and skill can be staged.

## Apply and recover

For each target:

1. atomically move an existing destination to its backup
2. atomically move the staged directory into place
3. verify the installed digest

If any step fails, reverse completed moves in transaction order. Preserve the
failed staged and displaced trees for inspection. Never delete the only copy of
an existing skill.

Keep client-native plugin or marketplace installation separate from copied
skill-directory transactions unless that client exposes equivalent planning,
backup, and rollback guarantees.

## Verify

- Ask the client to list or explicitly invoke the installed skill.
- Test one positive prompt and one adjacent near miss.
- Confirm repository-local instructions still take precedence.
- Report installed, skipped, conflicting, and unverified clients.

Do not install optional skills unless they were selected. Do not install every
advertised client merely because the source package supports them.
