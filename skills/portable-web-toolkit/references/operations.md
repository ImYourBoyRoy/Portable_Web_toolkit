# Operations routing

Use `node ./Web_Toolkit/<module>/bin/<command>.mjs --help` as the current command
contract. Verify exact flags rather than relying on this routing index.

| Operation | CLI |
|---|---|
| Project readiness | `site-readiness` |
| Safe project bootstrap | `project-init` |
| Site profile creation | `init-site-profile` |
| Site and integration diagnosis | `site-doctor`, `integration-doctor` |
| Browser and PageSpeed diagnosis | `browser-diagnostics`, `pagespeed-diagnostics` |
| Discovery validation | `discovery-doctor` |
| Cloudflare audit or authorized mutation | `cf-agent` |
| Header generation and audit | `headers-deploy` |
| Live quality smoke | `site-quality-smoke` |
| Brand and stylesheet validation | `brand-doctor`, `stylesheet-check` |
| Raster and vector preparation | `image-pipeline`, `vectorize-pipeline` |
| Public Instagram fallback | `instagram-clone` |
| Cache or generated-junk cleanup | `cache-purge`, `junk-purge` |
| Toolkit self-validation | `toolkit-verify`, `privacy-check` |

## Release sequence

Adapt the repository-approved sequence:

1. readiness and profile validation
2. project checks and immutable build
3. stylesheet and discovery validation on built output
4. Cloudflare and header dry runs
5. preview or staging deployment when available
6. smoke and runtime diagnostics
7. explicit production authorization
8. deploy the verified artifact
9. live quality, discovery, logs, and rollback verification

Never assume Workers and Pages share output paths, bindings, or deployment
commands. The active profile and repository scripts decide.

## Discovery

Use the project's established toolkit generators and `discovery-doctor` when
the toolkit contract owns discovery. Do not introduce a competing framework
integration. Keep public, preview, private, and non-indexed environments
distinct.
