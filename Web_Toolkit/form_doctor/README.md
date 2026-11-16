# form-doctor

Checks that contact and intake forms report failures honestly. Built from a real incident: a site caught a failed
`send_email` call, logged the whole visitor payload, and still answered `200 Success`, so the form said "Inquiry sent"
and the lead was lost with no trace. The same pattern, plus a `<form>` without `method` (a no-JS submit becomes GET and
puts the visitor's details in the URL), is easy to repeat, so the check is a tool, not a memory.

Why a new tool and not `integration-doctor`: that one reads env and live-integration posture (keys, markers, tokens).
This one reads form source and drives a local Worker, so it needs different inputs, a different exit contract and no
network access to a deployed site. Both are listed in `docs/TOOLS.md`.

## Usage

```bash
# Read-only source scan (any project; INFO when it has no form)
node Web_Toolkit/form_doctor/bin/form-doctor.mjs scan --project-root .

# After a build: scan, then probe a local Worker twice with a deliberately broken mail binding
node Web_Toolkit/form_doctor/bin/form-doctor.mjs run --project-root . --spawn --json-out output/form-doctor.json

# Probe a server you started yourself (loopback only) that you vouch has a broken mail binding
node Web_Toolkit/form_doctor/bin/form-doctor.mjs probe --project-root . --base-url http://127.0.0.1:8787 --expect-mail-failure
```

Exit `0` when there are no failures (warnings allowed, `--strict` makes them fail), `2` on failures, `1` on crashes or bad
arguments.

## Static scan rules

| Rule | Severity | Meaning |
|---|---|---|
| `form-no-method` | fail | `<form>` without `method`: no-JS submit is GET and leaks answers into the URL |
| `form-get-method` | fail | `method="get"` on a form that is not a search form |
| `form-no-action` | warn | `method="post"` without `action` posts to the (usually static) page |
| `swallowed-send-error` | fail | the catch around the mail send does not rethrow or return a 5xx (also `.send().catch()`) |
| `no-error-status` | fail | the handler never produces a 5xx, so success cannot be conditional on the send |
| `logs-payload` | fail | `console.*` receives the body, form data or a personal field |
| `returns-error-message` | fail | `err.message` or `err.stack` goes into the response |
| `no-body-cap` | fail | no Content-Length check, byte cap or 413 |
| `no-allowlist` | fail | every submitted key is copied (entries/fromEntries) with no allowlist or schema |
| `unescaped-html-email` | fail | an HTML email is built from interpolated values with no escape helper (tag stripping is not escaping) |
| `client-ignores-status` | warn | a form is posted with fetch and the response status is never checked |
| `no-origin-check`, `no-rate-limit`, `no-spam-control` | warn | missing same-origin check, rate limit, or honeypot/time trap/Turnstile |
| `no-handler-found` | warn | a POST form exists but no mail-sending handler is in the project |
| `malformed-surface` | fail | a form tag, file or try/catch could not be read or matched: fail closed, never skip |
| `no-form` | info | the project has no form surface |

A thin route is judged together with the files it imports (up to three levels), so `export const POST = (r) => handle(r)`
is analysed with `handle`. Opt-outs on a `<form>`: `data-form-doctor="ignore"`, `"client-only"` (JS only, no server round
trip) or `"get-ok"`. Search forms (`role="search"`) are never flagged. Heuristics, not a parser: a finding names the
file and line and says how to fix it.

## Runtime probe

`--spawn` writes one temporary copy of the built Worker config (`dist/server/wrangler.json`) next to it, starts
`wrangler dev` on a free loopback port, runs the probes, stops the server and deletes the copy. It runs twice: with every
`send_email` binding removed (expect `503`) and with the binding kept but allowed only an unreachable destination, which
the local simulator refuses the way a provider would (expect `502`). Probes send synthetic data only, never to a
non-loopback host (the probe refuses any other base URL), and use a distinct `cf-connecting-ip` per request so the
site's own rate limit does not skew results.

| Probe | Expectation |
|---|---|
| `form-method` | the served form declares `method="post"` |
| `get-no-data` | GET on the endpoint with data in the query is not 2xx |
| `oversize` | a 1.5 MB POST gets `413` |
| `unexpected-field` | a valid payload plus an unknown field gets `400` or `422` |
| `cross-site` | a POST with a foreign `Origin` gets `403` (warn otherwise) |
| `mail-missing` / `mail-rejected` | a valid payload with a broken mail binding is `503` / `502`, never 2xx |
| `no-leak` | no answer contains a stack trace, binding name, provider code or the probe address |

The valid payload is built from the served form HTML (honeypots, files and checkboxes skipped, first real `<option>`
chosen), so any site's form can be probed without configuration.

## Tests

`node --test Web_Toolkit/form_doctor/tests/*.test.mjs`: fixtures for the old and fixed handler patterns, every rule, malformed
input, the CLI contract, and probes against in-process fixture servers (lossy and honest).
