// ./Web_Toolkit/package_updater/src/commands/update.mjs
/**
 * Logic to fetch package versions from npm registry and update package.json.
 *
 * Preserves existing range operators (^, ~, >=, >, <=, <) when rewriting pins.
 * Defaults to ^ when the current value has no operator.
 *
 * Known peer constraints (do not force incompatible majors):
 * - typescript stays on the latest 6.x while @astrojs/check peers only allow ^5 || ^6
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

/** Packages whose latest major is not yet safe for the Astro site-starter stack. */
const MAJOR_CAPS = {
  // @astrojs/check@0.9.9 peers: typescript ^5.0.0 || ^6.0.0 (not ^7 yet)
  typescript: 6
};

function fetchLatestVersion(pkgName) {
  return new Promise((resolve, reject) => {
    https.get(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}/latest`, {
      headers: { 'User-Agent': 'Portable-Web-Toolkit-Package-Updater' }
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

function fetchLatestMatchingMajor(pkgName, major) {
  return new Promise((resolve, reject) => {
    https.get(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`, {
      headers: { 'User-Agent': 'Portable-Web-Toolkit-Package-Updater' }
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
          const versions = Object.keys(parsed.versions || {})
            .filter((v) => !v.includes('-') && v.startsWith(`${major}.`))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          if (!versions.length) {
            reject(new Error(`No stable ${major}.x versions found`));
            return;
          }
          resolve(versions[versions.length - 1]);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function detectRangeOperator(currentVal = '') {
  const value = String(currentVal || '').trim();
  if (value.startsWith('^')) return '^';
  if (value.startsWith('~')) return '~';
  if (value.startsWith('>=')) return '>=';
  if (value.startsWith('<=')) return '<=';
  if (value.startsWith('>')) return '>';
  if (value.startsWith('<')) return '<';
  if (value.startsWith('=')) return '=';
  return '^';
}

function formatTargetVersion(currentVal, latest) {
  const op = detectRangeOperator(currentVal);
  if (op === '>=' || op === '<=' || op === '>' || op === '<' || op === '=') {
    return `${op}${latest}`;
  }
  return `${op}${latest}`;
}

async function resolveTargetVersion(name, currentVal) {
  const cappedMajor = MAJOR_CAPS[name];
  if (cappedMajor != null) {
    const latest = await fetchLatestVersion(name);
    const latestMajor = Number(String(latest).split('.')[0]);
    if (latestMajor > cappedMajor) {
      const capped = await fetchLatestMatchingMajor(name, cappedMajor);
      return {
        version: capped,
        note: `capped at ${cappedMajor}.x (latest ${latest} exceeds @astrojs/check peer range)`
      };
    }
    return { version: latest, note: null };
  }
  const latest = await fetchLatestVersion(name);
  return { version: latest, note: null };
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
    const promises = packages.map(async (name) => {
      const currentVal = pkg[group][name];
      if (typeof currentVal !== 'string' || currentVal.startsWith('file:') || currentVal.startsWith('workspace:')) {
        console.log(`    • ${name}: ${currentVal} (skipped)`);
        return;
      }
      try {
        const { version: latest, note } = await resolveTargetVersion(name, currentVal);
        const targetVal = formatTargetVersion(currentVal, latest);
        if (currentVal !== targetVal) {
          console.log(`    • ${name}: ${currentVal} -> ${targetVal}${note ? ` [${note}]` : ''}`);
          updatesToApply[group][name] = targetVal;
          totalUpdatesFound++;
        } else {
          console.log(`    • ${name}: ${currentVal} (current)${note ? ` [${note}]` : ''}`);
        }
      } catch (e) {
        console.error(`    × ${name}: failed to fetch version (${e.message})`);
      }
    });

    await Promise.all(promises);
  }

  if (totalUpdatesFound > 0) {
    if (apply) {
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
