// ./Web_Toolkit/pagespeed_diagnostics/src/commands/raw-psi.mjs
/**
 * Fetches the entire raw PageSpeed API JSON for a given URL and strategy and saves
 * it to the output directory. This is the source of truth for deep-diving into 
 * all 149+ Lighthouse audits.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PORTABLE_ROOT, loadEnv, outputPaths, resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';

async function requestRawPageSpeed(url, strategy, apiKey) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) {
    endpoint.searchParams.append('category', category);
  }
  if (apiKey) endpoint.searchParams.set('key', apiKey);
  const response = await fetch(endpoint);
  return response.json();
}

export async function runRawPageSpeed(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const projectEnv = loadEnv(path.join(projectRoot, '.env'));
  const portableEnv = loadEnv(path.join(PORTABLE_ROOT, '.env'));
  const apiKey = String(flags['api-key'] || projectEnv.GOOGLE_PAGESPEED_API_KEY || projectEnv.PAGESPEED_API_KEY || portableEnv.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PAGESPEED_API_KEY || '').trim();
  const url = String(flags.url || `https://${resolved.profile.hosts.production[0]}`);
  const strategy = String(flags.strategy || 'mobile').toLowerCase();

  console.log(`[raw-psi] Fetching raw PageSpeed data for ${url} (${strategy})...`);
  const payload = await requestRawPageSpeed(url, strategy, apiKey);

  const paths = outputPaths(projectRoot, resolved.profile.siteId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawPath = path.join(paths.outputDir, `pagespeed-raw-${resolved.profile.siteId}-${strategy}-${timestamp}.json`);

  fs.mkdirSync(paths.outputDir, { recursive: true });
  fs.writeFileSync(rawPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`[raw-psi] Success. Raw JSON saved to: ${rawPath}`);
  
  if (flags['print-raw']) {
    console.log('\n--- Raw Response Summary ---');
    console.log(`Audit keys found: ${Object.keys(payload?.lighthouseResult?.audits || {}).length}`);
    console.log('Use high-level "run" command for a summarized Markdown report.');
  }

  return rawPath;
}
