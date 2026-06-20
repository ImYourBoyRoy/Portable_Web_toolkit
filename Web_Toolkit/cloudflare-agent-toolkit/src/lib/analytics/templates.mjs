// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/analytics/templates.mjs
/**
 * Generated template content for Astro analytics scaffolding.
 */

export function analyticsGa4Template() {
  return `---
// ./src/components/ga4.astro
/**
 * Loads Google Analytics 4 (gtag.js) for traffic acquisition and journey reporting.
 * Usage: Imported by the global layout so GA4 initializes on every route/page load.
 * Inputs: \`PUBLIC_GA4_MEASUREMENT_ID\`, \`PUBLIC_ANALYTICS_ENABLED\`.
 * Outputs: Creates \`window.dataLayer\`/\`window.gtag\` and sends page/session events to GA4.
 * Side effects: Issues client requests to Google Tag infrastructure when enabled.
 * Notes: No-op when the measurement id is missing or analytics are explicitly disabled.
 */
const ga4MeasurementId = String(import.meta.env.PUBLIC_GA4_MEASUREMENT_ID || "").trim();
const analyticsEnabled = String(import.meta.env.PUBLIC_ANALYTICS_ENABLED || "true").trim().toLowerCase() !== "false";
const shouldLoadGa4 = analyticsEnabled && ga4MeasurementId.length > 0;
---

{
  shouldLoadGa4 && (
    <>
      <script
        is:inline
        async
        src={\`https://www.googletagmanager.com/gtag/js?id=\${encodeURIComponent(ga4MeasurementId)}\`}
      ></script>
      <script is:inline define:vars={{ ga4MeasurementId }}>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = window.gtag || gtag;
        gtag("js", new Date());
        const host = window.location.hostname.toLowerCase();
        const debugMode =
          host === "localhost" ||
          host === "127.0.0.1" ||
          host.startsWith("dev.") ||
          host.startsWith("staging.") ||
          host.endsWith(".workers.dev");
        gtag("config", ga4MeasurementId, {
          send_page_view: true,
          debug_mode: debugMode
        });
      </script>
    </>
  )
}
`;
}

export function analyticsPosthogTemplate() {
  return `---
// ./src/components/posthog.astro
/**
 * Loads the PostHog browser client for product analytics in rendered pages.
 * Usage: Imported by the global layout and emitted in \`<head>\` for global capture.
 * Inputs: \`PUBLIC_POSTHOG_API_KEY\`, \`PUBLIC_POSTHOG_API_HOST\`, \`PUBLIC_ANALYTICS_ENABLED\`.
 * Outputs: Initializes \`window.posthog\` and enables page/click/session event capture.
 * Side effects: Sends client analytics to PostHog when enabled.
 * Notes: No-op when the API key is missing or analytics are explicitly disabled.
 */
const posthogApiKey = String(import.meta.env.PUBLIC_POSTHOG_API_KEY || "").trim();
const posthogApiHost = String(import.meta.env.PUBLIC_POSTHOG_API_HOST || "https://us.i.posthog.com").trim();
const analyticsEnabled = String(import.meta.env.PUBLIC_ANALYTICS_ENABLED || "true").trim().toLowerCase() !== "false";
const shouldLoadPosthog = analyticsEnabled && posthogApiKey.length > 0;
---

{
  shouldLoadPosthog && (
    <script is:inline define:vars={{ posthogApiKey, posthogApiHost }}>
      if (!window.__posthog_initialized) {
        window.__posthog_initialized = true;
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group identify setPersonProperties setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags resetGroups onFeatureFlags addFeatureFlagsHandler onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
        posthog.init(posthogApiKey, {
            api_host: posthogApiHost,
            defaults: "2026-01-30",
            capture_pageview: "history_change",
            disable_session_recording: true,
            disable_surveys: true
        });
      }
    </script>
  )
}
`;
}

export function middlewareTemplate() {
  return `// ./src/middleware.ts
/**
 * Global middleware that applies baseline security headers and analytics-ready CSP directives.
 *
 * Run: Auto-executed by Astro on every request.
 * Inputs: Request context and downstream response from \`next()\`.
 * Outputs: Hardened response headers including CSP allowances for GA4 + PostHog.
 * Side effects: None beyond response header mutations.
 * Notes: Extend this middleware with auth/session logic as needed by your application.
 */
import type { MiddlewareHandler } from 'astro';

export const onRequest: MiddlewareHandler = async (_context, next) => {
  const response = await next();
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'SAMEORIGIN');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'content-security-policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://www.googletagmanager.com https://us-assets.i.posthog.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://www.google-analytics.com",
      "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://us.i.posthog.com",
      "worker-src 'self' blob:"
    ].join('; ')
  );
  if (!response.headers.has('referrer-policy')) {
    response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  }
  return response;
};
`;
}

