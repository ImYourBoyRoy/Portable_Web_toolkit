# Registrar

DNS delegation helpers for moving domains to Cloudflare (e.g. Porkbun → Cloudflare nameservers).

## CLI

```bash
node ./registrar/registrar.mjs --help
```

## Related

- **[Cloudflare Agent](../cloudflare-agent-toolkit/README.md)** — DNS audit and repair after delegation
- **[OPERATIONS.md](../OPERATIONS.md)** — staging → production deploy sequence

## Notes

- Always dry-run registrar changes before applying.
- Keep API credentials in the **client project** `.env`, never in the toolkit repo.
