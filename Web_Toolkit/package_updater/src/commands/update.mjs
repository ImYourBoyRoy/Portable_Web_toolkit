// ./Web_Toolkit/package_updater/src/commands/update.mjs
/**
 * Logic to fetch package versions from npm registry and update package.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

function fetchLatestVersion(pkgName) {
  return new Promise((resolve, reject) => {
    // Some scoped packages or specific packages might fail; standard HTTPS get is sufficient
    https.get(`https://registry.npmjs.org/${pkgName}/latest`, {
      headers: { 'User-Agent': 'Antigravity-Package-Updater' }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP status ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.version) {
            resolve(parsed.version);
          } else {
            reject(new Error('Invalid response payload'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

export async function runPackageUpdate(flags = {}) {
  const projectRoot = flags['project-root'] || '.';
  const apply = flags['apply'] || false;

  const pkgPath = path.resolve(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error(`[package-updater] package.json not found at ${pkgPath}`);
    return 1;
  }

  let pkgContent;
  try {
    pkgContent = fs.readFileSync(pkgPath, 'utf8');
  } catch (e) {
    console.error(`[package-updater] failed to read package.json: ${e.message}`);
    return 1;
  }

  let pkg;
  try {
    pkg = JSON.parse(pkgContent);
  } catch (e) {
    console.error(`[package-updater] failed to parse JSON in package.json: ${e.message}`);
    return 1;
  }

  const depGroups = ['dependencies', 'devDependencies'];
  let totalUpdatesFound = 0;
  const updatesToApply = {};

  console.log(`[package-updater] scanning package.json in ${projectRoot}...`);

  for (const group of depGroups) {
    if (!pkg[group] || Object.keys(pkg[group]).length === 0) continue;

    console.log(`\n  Checking group: [${group}]`);
    updatesToApply[group] = {};

    const packages = Object.keys(pkg[group]);
    // Process in batches or parallel
    const promises = packages.map(async (name) => {
      const currentVal = pkg[group][name];
      try {
        const latest = await fetchLatestVersion(name);
        const targetVal = `^${latest}`;
        if (currentVal !== targetVal) {
          console.log(`    • ${name}: ${currentVal} -> ${targetVal}`);
          updatesToApply[group][name] = targetVal;
          totalUpdatesFound++;
        } else {
          console.log(`    • ${name}: ${currentVal} (current)`);
        }
      } catch (e) {
        console.error(`    × ${name}: failed to fetch version (${e.message})`);
      }
    });

    await Promise.all(promises);
  }

  if (totalUpdatesFound > 0) {
    if (apply) {
      // Apply updates to original object
      for (const group of depGroups) {
        if (!updatesToApply[group]) continue;
        for (const [name, targetVal] of Object.entries(updatesToApply[group])) {
          pkg[group][name] = targetVal;
        }
      }
      try {
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        console.log(`\n[package-updater] SUCCESS: package.json updated with ${totalUpdatesFound} updates.`);
      } catch (e) {
        console.error(`\n[package-updater] FAILED: could not write to package.json: ${e.message}`);
        return 1;
      }
    } else {
      console.log(`\n[package-updater] INFO: found ${totalUpdatesFound} updates. Run with --apply to update package.json.`);
    }
  } else {
    console.log('\n[package-updater] all packages are already up-to-date.');
  }

  return 0;
}
