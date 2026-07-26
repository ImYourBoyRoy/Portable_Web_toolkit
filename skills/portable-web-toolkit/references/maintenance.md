# Toolkit maintenance

## Updates

Use `toolkit-update` for read-only comparison before changing toolkit source or
installed skills. Prefer a tagged release or immutable commit. Preserve local
changes and never reinstall every client automatically.

An exported toolkit folder without Git metadata cannot perform `git pull`.
Create or update a real clone, compare local-only capabilities, validate it,
then switch the project link deliberately.

## Skill distribution

The primary installation path is agent-driven:

1. inspect `skill-pack.json`
2. locate the target client's documented discovery root
3. compare name, version metadata, and content
4. report current, missing, different, or conflicting skills
5. mutate only after explicit install or update authorization
6. preserve displaced content outside discovery roots

Optional helper scripts must default to status and must not overwrite unmanaged
or locally modified skills.

## Host setup

Machine setup is a separate privileged task. Inspect the setup manifest and
scripts before execution. Explain requested tools, system locations, network
downloads, elevation, and rollback. Obtain authorization before installing or
changing Git, Node, Python managers, browser tooling, or system packages.

Do not impose the toolkit's preferred Python manager on unrelated projects or
replace an established host toolchain without explicit direction.

## Publishing

Publishing the toolkit is separate from client-site work. Require an intended
version and source commit, clean release inputs, privacy validation, toolkit
verification, inventory reconciliation, release notes, and an archive checksum
sidecar. Never publish or push merely because local toolkit maintenance passed.
