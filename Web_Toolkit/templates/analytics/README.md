# Analytics + consent template

Privacy-first analytics for Astro + Cloudflare sites: GA4, PostHog and Cloudflare Web Analytics, all **off until the
visitor opts in**, behind one accessible banner. Unset ids make every component render nothing.

## Copy map

Paths are relative to `Web_Toolkit/templates/analytics/`. The components import with these destinations in mind.

| Template path | Client destination |
|---|---|
| `components/*.astro` | `src/components/analytics/` |
| `lib/*.ts` | `src/lib/analytics/` |
| `styles/analytics-consent.css` | `src/styles/components/analytics-consent.css` (import from the global CSS) |
| `analytics.config.example.json` | `src/data/analytics.json` (optional) |

## Wire it in (base layout)

```astro
---
import AnalyticsConsent from '../components/analytics/AnalyticsConsent.astro';
import Ga4 from '../components/analytics/Ga4.astro';
import PostHog from '../components/analytics/PostHog.astro';
import CloudflareWebAnalytics from '../components/analytics/CloudflareWebAnalytics.astro';
import PrivacyChoices from '../components/analytics/PrivacyChoices.astro';
---
<head> ... <Ga4 /> <PostHog /> <CloudflareWebAnalytics /> </head>
<body>
  <slot />
  <footer> ... <PrivacyChoices /> </footer>
  <AnalyticsConsent privacyHref="/privacy/" />
</body>
```

Render each component once. Provider components may sit in `<head>` or `<body>`; the banner goes at the end of
`<body>`. `PrivacyChoices` is the persistent re-open control (a real button, 44px target); hand-written triggers only
need the attribute `data-pwt-privacy-choices`. Link `privacyHref` to a page that names what each provider collects.

## Configuration

Public env vars (project `.env`; env wins over JSON), or `src/data/analytics.json`:

| Env var | JSON key | Notes |
|---|---|---|
| `PUBLIC_GA4_ID` | `ga4.measurementId` | `G-XXXXXXXX` |
| `PUBLIC_POSTHOG_KEY` | `posthog.key` | `phc_...` project key |
| `PUBLIC_POSTHOG_HOST` | `posthog.host` | default `https://us.i.posthog.com`; `https://eu.i.posthog.com` for EU |
| `PUBLIC_CF_BEACON_TOKEN` | `cloudflareWebAnalytics.token` | 32 hex characters |
| `PUBLIC_ANALYTICS_ENABLED` | `enabled` | `false` switches every provider off |

JSON-only options: `posthog.autocapture` and `posthog.sessionRecording` (both default `false`),
`cloudflareWebAnalytics.requireConsent` (default `true`) and `.spa`, and the banner copy under `consent`.
Invalid ids are dropped with a build warning. Older sites used `PUBLIC_GA4_MEASUREMENT_ID` and
`PUBLIC_POSTHOG_API_KEY/HOST`; rename them when adopting this template.

PostHog follows the toolkit defaults: `defaults: "2026-08-30"` (latest in `@posthog/types`, CHANGELOG 2026-11-01),
`capture_pageview: "history_change"`, no surveys, Do Not Track respected, no autocapture or replay unless enabled.

## Consent contract (for your own scripts)

- Storage key `pwt-analytics-consent`: `{"v":1,"status":"granted"|"denied","at":<ms>}`. The choice expires after 180 days
  (`CONSENT_MAX_AGE_DAYS` in `lib/consent.ts`), then the banner asks again.
- Event `pwt:analytics-consent` on `window`, `detail: { status, previous, source }` (`source`: `set` | `sync` | `reset`).
- `window.pwtAnalyticsConsent`: `get()`, `effective()` (denied until granted), `set(status)`, `reset()`, `subscribe(fn)`,
  `open()`. Dispatch `pwt:analytics-consent-open` on `window` to open the banner.
- Cross-tab changes sync through the `storage` event. Blocked or failing storage never throws; the choice then holds for
  the current page only.
- Bring your own banner: write the key and dispatch the event, and the provider components follow.

Behaviour: no cookies, requests or scripts from any provider before opting in. Revoking consent stops GA4 (opt-out flag,
Consent Mode `denied`, `_ga*` cookies cleared) and PostHog (`opt_out_capturing` + `reset`); a Cloudflare beacon that is
already running stops on the next page load. Advertising storage, signals and personalization are always denied.

## CSP notes

Component scripts are bundled same-origin modules; the JSON config blocks are data, not executed. Astro may inline very
small scripts, so either hash them (Astro `security.csp`) or set `vite.build.assetsInlineLimit: 0`.

| Provider | `script-src` | `connect-src` | `img-src` |
|---|---|---|---|
| GA4 | `https://www.googletagmanager.com` | `https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com` | `https://*.google-analytics.com https://www.googletagmanager.com` |
| PostHog (US) | `https://us-assets.i.posthog.com` | `https://us.i.posthog.com https://us-assets.i.posthog.com` | |
| PostHog (EU) | `https://eu-assets.i.posthog.com` | `https://eu.i.posthog.com https://eu-assets.i.posthog.com` | |
| Cloudflare Web Analytics | `https://static.cloudflareinsights.com` | `https://cloudflareinsights.com` | |

## Privacy notes

- Opt-in model: default OFF, equal-weight Allow / Keep off buttons, no dark patterns, re-openable at any time.
- Cloudflare Web Analytics is cookieless; `requireConsent: false` loads it for everyone. Make that call with your
  privacy policy and counsel. Do not also enable Cloudflare's automatic edge injection for the same site.
- Tell visitors what is collected, by whom, and for how long, on the page `privacyHref` points to.
- This is an engineering aid, not legal advice. Regional rules (GDPR/ePrivacy, UK PECR, CPRA) differ.

## Tests

`node --test Web_Toolkit/templates/analytics/tests/*.test.mjs` covers the consent state machine, config resolution,
provider helpers and the CSS token conformance check (also scans `templates/contact`).
