# Contributing

Portable Web Toolkit accepts focused fixes and portable enhancements. Keep
client names, domains, credentials, machine paths, and private site profiles
out of this repository.

## Before opening a change

1. Read `AGENTS.md` and the policy nearest the files you will change.
2. Preserve the boundary between generic agent workflows and the toolkit's
   Astro + Cloudflare specialization.
3. Keep installation agent-driven. Status helpers may inspect and compare;
   they must not silently replace installed skills.
4. Update `CHANGELOG.md` for user-visible behavior.
5. If a skill changes, update its metadata and regenerate the content hashes:

   ```bash
   node ./scripts/update-skill-hashes.mjs
   ```

6. Run the complete local gate:

   ```bash
   npm run validate
   npm ci --ignore-scripts --prefix Web_Toolkit/vectorize_pipeline
   npm --prefix Web_Toolkit/vectorize_pipeline audit --audit-level=high
   ```

The repository's pinned GitHub Actions workflow repeats the portable validation
on pushes and pull requests.

## Releases

Release versions must agree across `VERSION`, both package manifests, both
plugin manifests, and `skill-pack.json`. Add a dated changelog entry before
tagging `v<version>`.

Do not commit generated runtime data, exported verification trees, secrets, or
client-specific configuration.
