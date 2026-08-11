// ./Web_Toolkit/cloudflare-agent-toolkit/src/config/defaults.mjs
/**
 * Default configuration constants for audits and hardening.
 *
 * Shared by token/zone audit and zone hardening commands to keep behavior
 * consistent across environments.
 */

export const REQUIRED_PERMISSION_NAMES = [
  'Zone Read',
  'Zone Write',
  'Zone Settings Write',
  'DNS Write',
  'Cache Purge',
  'SSL and Certificates Write',
  'Zone WAF Write',
  'Bot Management Read',
  'Bot Management Write',
  'Analytics Read',
  'Workers Routes Write',
  'Workers Scripts Write',
  'Workers KV Storage Write',
  'Workers R2 Storage Write',
  'D1 Write',
  'Pages Write',
  'Account Rulesets Write',
  'Dynamic URL Redirects Write',
  // Token self-repair (cf-agent permissions repair) and dashboard Edit recipes
  'API Tokens Write',
  'Account API Tokens Write',
  // Cloudflare One / Gateway Edit when Zero Trust Gateway work is in scope
  'Gateway Write'
];

export const SETTINGS_TO_CHECK = [
  'always_use_https',
  'automatic_https_rewrites',
  'ssl',
  'min_tls_version',
  'tls_1_3',
  'security_header',
  'security_level',
  'browser_check',
  'waf',
  '0rtt',
  'http3',
  'brotli',
  'early_hints',
  'ipv6',
  'cache_level',
  'development_mode',
  'minify'
];

export const HARDENING_SETTINGS = [
  { id: 'always_use_https', value: 'on' },
  { id: 'automatic_https_rewrites', value: 'on' },
  { id: 'ssl', value: 'strict' },
  { id: 'min_tls_version', value: '1.2' },
  { id: 'tls_1_3', value: 'on' },
  { id: 'browser_check', value: 'on' },
  { id: 'security_level', value: 'medium' },
  { id: '0rtt', value: 'off' },
  { id: 'http3', value: 'on' },
  { id: 'brotli', value: 'on' },
  { id: 'ipv6', value: 'on' },
  { id: 'early_hints', value: 'on' },
  { id: 'cache_level', value: 'basic' },
  { id: 'development_mode', value: 'off' },
  {
    id: 'security_header',
    value: {
      strict_transport_security: {
        enabled: true,
        max_age: 31536000,
        include_subdomains: true,
        preload: false,
        nosniff: true
      }
    }
  }
];

