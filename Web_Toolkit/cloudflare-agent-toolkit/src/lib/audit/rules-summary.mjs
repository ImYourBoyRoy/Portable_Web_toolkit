// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/audit/rules-summary.mjs
/**
 * Cloudflare ruleset and page-rule summarizers.
 */

const PHASE_LABELS = {
  http_request_dynamic_redirect: 'Single Redirects',
  http_request_redirect: 'Bulk Redirects',
  http_request_transform: 'URL Rewrite Rules',
  http_request_origin: 'Origin Rules',
  http_request_cache_settings: 'Cache Rules',
  http_response_headers_transform: 'Managed/Response Headers',
  http_request_late_transform: 'Request Header Transforms',
  http_request_firewall_managed: 'Managed WAF Entry',
  http_request_firewall_custom: 'Custom Firewall Rules',
  http_config_settings: 'Configuration Rules'
};

export function summarizeRulesets(rulesets = [], pageRules = []) {
  const counts = {};
  for (const entry of rulesets) {
    const phase = String(entry.phase || 'unknown');
    counts[phase] = (counts[phase] || 0) + 1;
  }
  const interesting = Object.entries(PHASE_LABELS).map(([phase, label]) => ({
    phase,
    label,
    count: counts[phase] || 0
  }));
  return {
    totalRulesets: rulesets.length,
    legacyPageRules: pageRules.length,
    phases: interesting,
    present: interesting.filter((entry) => entry.count > 0)
  };
}

