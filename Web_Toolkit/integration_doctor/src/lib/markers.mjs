// ./Web_Toolkit/integration_doctor/src/lib/markers.mjs
/**
 * Integration defaults and marker resolution helpers.
 */

const DEFAULTS = {
  analytics: {
    ga4: {
      path: '/',
      envKeys: ['PUBLIC_ANALYTICS_ENABLED', 'PUBLIC_GA4_MEASUREMENT_ID'],
      markers: ['googletagmanager', 'gtag/js?id=', 'google-analytics.com']
    },
    posthog: {
      path: '/',
      envKeys: ['PUBLIC_ANALYTICS_ENABLED', 'PUBLIC_POSTHOG_API_HOST', 'PUBLIC_POSTHOG_API_KEY'],
      markers: ['posthog']
    }
  },
  forms: {
    feedback: {
      path: '/feedback',
      envKeys: ['WEB3FORMS_ACCESS_KEY', 'WEB3FORMS_KEY'],
      markers: ['web3forms', 'api.web3forms.com']
    },
    turnstile: {
      path: '/contact',
      envKeys: ['PUBLIC_TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'],
      markers: ['challenges.cloudflare.com', 'turnstile']
    }
  },
  auth: {
    passkey: {
      path: '/account',
      envKeys: [],
      markers: ['/api/auth/passkey/', 'passkey', 'webauthn']
    }
  }
};

export function resolveIntegrationDefinition(category, name, spec = {}) {
  const defaults = DEFAULTS[category]?.[name] || {};
  return {
    category,
    name,
    label: `${category}.${name}`,
    provider: String(spec.provider || defaults.provider || name),
    required: Boolean(spec.required),
    path: String(spec.path || defaults.path || ''),
    envKeys: [...new Set([...(defaults.envKeys || []), ...((spec.envKeys || []).filter(Boolean))])],
    markers: [...new Set([...(defaults.markers || []), ...((spec.markers || []).filter(Boolean))])]
  };
}

export function markerHits(body = '', markers = []) {
  const normalized = String(body || '').toLowerCase();
  return (markers || []).filter((marker) => normalized.includes(String(marker).toLowerCase()));
}

