# Package Updater

Checks npm registry versions and optionally rewrites `package.json` dependency pins while preserving range operators (`^`, `~`, `>=`, …).

For **Astro** projects, also runs the official upgrade tool:

```bash
npx --yes @astrojs/upgrade [--dry-run]
```

That keeps Astro core and official `@astrojs/*` integrations coordinated — pin bumps alone are not enough.

## Usage

```bash
# Dry-run: @astrojs/upgrade --dry-run + registry pin report
node ./Web_Toolkit/package_updater/bin/package-updater.mjs run --project-root .

# Apply: real @astrojs/upgrade + write pin updates
node ./Web_Toolkit/package_updater/bin/package-updater.mjs run --project-root . --apply

# Pins only
node ./Web_Toolkit/package_updater/bin/package-updater.mjs run --project-root . --skip-astro-upgrade --apply

# Optional Astro dist-tag
node ./Web_Toolkit/package_updater/bin/package-updater.mjs run --project-root . --apply --astro-tag latest
```

## Behavior

1. **Astro detect** — `astro` in dependencies/devDependencies, or an `astro.config.*` file.
2. **`@astrojs/upgrade`** — dry-run unless `--apply`; skip with `--skip-astro-upgrade`.
3. **Registry pins** — latest stable for each remaining dependency; preserves operators.
4. **TypeScript cap** — stays on latest 6.x while `@astrojs/check` peers only allow `^5 || ^6`.
5. Skips `file:` and `workspace:` references.
6. **Exits non-zero** when registry fetch fails or `@astrojs/upgrade` fails.

After `--apply`, run `npm install` in the project if the lockfile still needs a refresh.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Astro upgrade (if any) and registry lookups succeeded. |
| `1` | Missing/invalid `package.json`, write failure, registry fetch failure, or `@astrojs/upgrade` failure. |
