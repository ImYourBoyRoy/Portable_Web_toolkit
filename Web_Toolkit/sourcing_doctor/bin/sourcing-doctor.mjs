#!/usr/bin/env node
// ./Web_Toolkit/sourcing_doctor/bin/sourcing-doctor.mjs
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { runExtract } from '../src/commands/extract.mjs';
import { assertPublicHttpUrl } from '../../shared/lib/url-safety.mjs';

/**
 * Sourcing Doctor CLI
 */
function printHelp() {
  console.log('sourcing-doctor — Import/audit legacy CMS content sources');
  console.log('');
  console.log('Usage:');
  console.log('  sourcing-doctor audit --site-profile <path> --project-root <path>');
  console.log('  sourcing-doctor extract --site-profile <path> --project-root <path>');
  console.log('');
  console.log('Notes:');
  console.log('  Currently supports WordPress REST sources configured in profile.sourcing.');
}

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command || ['help', '--help', '-h'].includes(String(command).toLowerCase())) {
    printHelp();
    process.exit(command ? 0 : 1);
  }
  
  const siteProfileIndex = args.indexOf('--site-profile');
  const projectRootIndex = args.indexOf('--project-root');
  
  if (siteProfileIndex === -1 || projectRootIndex === -1) {
    printHelp();
    process.exit(1);
  }
  
  const profilePath = resolve(args[siteProfileIndex + 1]);
  const projectRoot = resolve(args[projectRootIndex + 1]);
  
  let profile;
  try {
    profile = JSON.parse(await readFile(profilePath, 'utf8'));
  } catch (error) {
    console.error(`[ERROR] Failed to read site profile at ${profilePath}`, error);
    process.exit(1);
  }
  
  if (command === 'extract') {
    if (profile.sourcing?.type === 'wordpress') {
      await runExtract(profile, projectRoot);
    } else {
      console.error(`[ERROR] Sourcing type "${profile.sourcing?.type}" not supported yet.`);
      process.exit(1);
    }
  } else if (command === 'audit') {
    console.log(`[INFO] Audit mode: Checking ${profile.sourcing?.url} for WordPress API readiness...`);
    // Basic audit logic
    try {
      const apiUrl = assertPublicHttpUrl(`${profile.sourcing.url}/wp-json/wp/v2/posts?per_page=1`, 'WordPress API URL').href;
      const response = await fetch(apiUrl);
      if (response.ok) {
        console.log(`[PASS] WordPress REST API is active and accessible.`);
      } else {
        console.error(`[FAIL] WordPress REST API returned ${response.status}.`);
      }
    } catch (error) {
      console.error(`[FAIL] Could not connect to WordPress API.`, error);
    }
  } else {
    console.error(`[ERROR] Unknown command: ${command}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[UNHANDLED ERROR]', err);
  process.exit(1);
});
