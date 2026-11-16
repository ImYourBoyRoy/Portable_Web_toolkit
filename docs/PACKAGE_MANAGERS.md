# Package managers

**Sites: pnpm by default.** A shared content-addressable store (a second site added ~80 MB instead of ~665 MB in a measured
comparison), strict non-flat `node_modules`, and install-script allowlists. Every toolkit command that touches a client
project goes through `Web_Toolkit/shared/lib/package-manager.mjs`, which picks the manager in this order: `--package-manager` /
`PORTABLE_TOOLKIT_PM`, the project's lockfile, `package.json` `packageManager` (name only; the version is never read or
written, so nothing is pinned), then pnpm if installed. An existing npm/yarn/bun site keeps working untouched.

## Converting a site

```bash
node ./Web_Toolkit/package_updater/bin/package-updater.mjs migrate --project-root .          # dry-run: plan only
node ./Web_Toolkit/package_updater/bin/package-updater.mjs migrate --project-root . --apply  # convert, install, verify check+build
```

It runs `pnpm import` (resolved versions are kept), writes `pnpm-workspace.yaml` (`allowBuilds` from npm's `allowScripts` plus the
toolkit's known natives esbuild/sharp/workerd, and `overrides` with `$name` references resolved), rewrites `npm run` / `npx` /
`npm install -D` / `npm ci` in scripts, drops an npm `packageManager` pin, sets `engines.pnpm`, and removes the old lockfile only
after install and verification pass. **Any failure restores every file and re-installs with the old manager.** It lists other files
that still say npm (CI workflows, wrangler/Dockerfile, docs) for you to update; it never edits those.

pnpm 12 fails an install on any dependency build script it was not told about. The migration names each one
(`ERR_PNPM_IGNORED_BUILDS: core-js-pure`) and the decision is yours: `--allow-builds <names>` (trust, it runs its install script)
or `--deny-builds <names>` (block). Nothing is auto-approved beyond the known natives.

## The toolkit itself uses pnpm too

- **Repository scripts and CI** (`pnpm run validate`, `pnpm install --frozen-lockfile`, `pnpm audit`) and the WCAGate repository's own scripts and CI are pnpm. CI installs pnpm with `npm install --global pnpm` (npm ships with Node), so no pnpm version is pinned anywhere.
- **The WCAGate engine** (`github:imyourboyroy/WCAGate#semver:*`, installed into `Web_Toolkit/node_modules`) installs with pnpm when it is installed, and with npm when it is not, so a machine that has only Node can still bootstrap. `PORTABLE_TOOLKIT_PM=npm|pnpm` overrides (`shared/lib/engine-spec.mjs`). pnpm resolves the `#semver:*` range to the newest release tag the same way npm does; its lockfile in `Web_Toolkit/` is git-ignored because the engine is never locked, and a refresh reinstalls the spec (`pnpm add <spec>`) because an update does not refetch git dependencies. pnpm prints "Agent skills awaiting approval" for the engine's bundled skills; the toolkit installs skills itself (`docs/agent-skills/`), so that notice can be ignored.
- **Not yet converted:** the machine-level installer (`Setup_agent_environment`, `bootstrap.sh`) still lists pnpm as optional and only guarantees Node and npm; the engine falls back to npm there.
