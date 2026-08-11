# Registrar

Domain migration helpers: Porkbun registrar API + Cloudflare zone/NS/redirect pipeline.

**Mutations are dry-run by default.** Pass `--apply` to mutate. NS cutover requires apex MX on the Cloudflare zone (or `--allow-missing-email`).

## Commands

```bash
node ./Web_Toolkit/registrar/registrar.mjs status --site-profile <path>
node ./Web_Toolkit/registrar/registrar.mjs ping
node ./Web_Toolkit/registrar/registrar.mjs domains
node ./Web_Toolkit/registrar/registrar.mjs zone ensure --site-profile <path>          # dry-run
node ./Web_Toolkit/registrar/registrar.mjs zone ensure --site-profile <path> --apply
node ./Web_Toolkit/registrar/registrar.mjs ns audit --site-profile <path>
node ./Web_Toolkit/registrar/registrar.mjs ns update --site-profile <path>           # dry-run + MX gate
node ./Web_Toolkit/registrar/registrar.mjs ns update --site-profile <path> --apply
node ./Web_Toolkit/registrar/registrar.mjs ns update --site-profile <path> --apply --allow-missing-email
node ./Web_Toolkit/registrar/registrar.mjs redirect --site-profile <path>            # dry-run
node ./Web_Toolkit/registrar/registrar.mjs redirect --site-profile <path> --apply
```

## Environment

Credentials load from the **site profile `projectRoot/.env` first**, then toolkit `.env`, then `process.env`:

- `PORKBUN_API_KEY` / `PORKBUN_SECRET_KEY`
- `CLOUDFLARE_API_TOKEN` (and account id as needed)

## Status pipeline

`status` awaits the full migration check and prints steps (registrar → zone → **email/MX** → NS → activation gate → DNS → Pages/redirect → hardening). Exit `0` when complete, `2` when action/wait remains.

## Email / MX gate

Before `ns update --apply`, the tool verifies the Cloudflare zone has an apex **MX** record. Without MX, cutover can break inbound mail. Override only with `--allow-missing-email` (loud warning).

## Reports

JSON under `Web_Toolkit/.runtime/reports/registrar/`.

## Tests

```bash
node --test ./Web_Toolkit/registrar/tests/*.test.mjs
```
