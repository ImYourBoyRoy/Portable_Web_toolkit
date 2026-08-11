// ./Web_Toolkit/package_updater/src/commands/update.mjs
/**
 * Update a client package.json to current registry floors, and for Astro
 * projects run the official `npx @astrojs/upgrade` path.
 *
 * Preserves existing range operators (^, ~, >=, >, <=, <) when rewriting pins.
 * Defaults to ^ when the current value has no operator.
 *
 * Known peer constraints (do not force incompatible majors):
 * - typescript stays on the latest 6.x while @astrojs/check peers only allow ^5 || ^6
 *
 * Astro projects (astro dep and/or astro.config.*):
 * - dry-run: `npx --yes @astrojs/upgrade --dry-run`
 * - --apply: `npx --yes @astrojs/upgrade` then registry pin rewrite + note to npm install
 * - skip with --skip-astro-upgrade
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { isAstroProject, runAstroUpgrade } from '../lib/astro-upgrade.mjs';

/** Packages whose latest major is not yet safe for the Astro site-starter stack. */
const MAJOR_CAPS = {
  // @astrojs/check peers: typescript ^5.0.0 || ^6.0.0 (not ^7 yet)
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
  return `${op}${latest}`;
}

async function resolveTargetVersion(name) {
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

function readPackageJson(pkgPath) {
  const pkgContent = fs.readFileSync(pkgPath, 'utf8');
  return JSON.parse(pkgContent);
}

function boolFlag(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

/**
 * @param {object} flags
 * @param {{ runAstroUpgradeFn?: typeof runAstroUpgrade }} [hooks]
 */
export async function runPackageUpdate(flags = {}, hooks = {}) {
  const projectRoot = path.resolve(flags['project-root'] || '.');
  const apply = boolFlag(flags.apply, false);
  const skipAstroUpgrade = boolFlag(flags['skip-astro-upgrade'], false);
  const astroTag = typeof flags['astro-tag'] === 'string' && flags['astro-tag'].trim()
    ? flags['astro-tag'].trim()
    : 'latest';
  const runAstroUpgradeFn = hooks.runAstroUpgradeFn || runAstroUpgrade;

  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error(`[package-updater] package.json not found at ${pkgPath}`);
    return 1;
  }

  let pkg;
  try {
    pkg = readPackageJson(pkgPath);
  } catch (e) {
    console.error(`[package-updater] failed to read/parse package.json: ${e.message}`);
    return 1;
  }

  const astroProject = isAstroProject(pkg, projectRoot);
  if (astroProject && !skipAstroUpgrade) {
    console.log(`[package-updater] Astro project detected — running @astrojs/upgrade (${apply ? 'apply' : 'dry-run'})…`);
    const result = await runAstroUpgradeFn({
      projectRoot,
      apply,
      tag: astroTag
    });
    console.log(`[package-updater] astro upgrade command: ${result.command.join(' ')}`);
    if (result.code !== 0) {
      console.error(
        `[package-updater] FAILED: @astrojs/upgrade exited ${result.code}`
        + (result.reason ? ` (${result.reason})` : '')
      );
      return 1;
    }
    console.log(`[package-updater] @astrojs/upgrade completed.`);
    // Re-read after apply — upgrade mutates package.json / lockfile.
    try {
      pkg = readPackageJson(pkgPath);
    } catch (e) {
      console.error(`[package-updater] failed to re-read package.json after Astro upgrade: ${e.message}`);
      return 1;
    }
  } else if (astroProject && skipAstroUpgrade) {
    console.log('[package-updater] skipping @astrojs/upgrade (--skip-astro-upgrade).');
  } else {
    console.log('[package-updater] no Astro project markers — skipping @astrojs/upgrade.');
  }

  const depGroups = ['dependencies', 'devDependencies'];
  let totalUpdatesFound = 0;
  let fetchFailures = 0;
  const updatesToApply = {};

  console.log(`[package-updater] scanning package.json pins in ${projectRoot}…`);

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
        const { version: latest, note } = await resolveTargetVersion(name);
        const targetVal = formatTargetVersion(currentVal, latest);
        if (currentVal !== targetVal) {
          console.log(`    • ${name}: ${currentVal} -> ${targetVal}${note ? ` [${note}]` : ''}`);
          updatesToApply[group][name] = targetVal;
          totalUpdatesFound++;
        } else {
          console.log(`    • ${name}: ${currentVal} (current)${note ? ` [${note}]` : ''}`);
        }
      } catch (e) {
        fetchFailures += 1;
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
        fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
        console.log(`\n[package-updater] SUCCESS: package.json updated with ${totalUpdatesFound} pin update(s).`);
        console.log('[package-updater] Next: run `npm install` in the project root if the lockfile still needs refresh.');
      } catch (e) {
        console.error(`\n[package-updater] FAILED: could not write to package.json: ${e.message}`);
        return 1;
      }
    } else {
      console.log(`\n[package-updater] INFO: found ${totalUpdatesFound} pin update(s). Run with --apply to write package.json (and run @astrojs/upgrade for real).`);
    }
  } else {
    console.log('\n[package-updater] all scanned package pins are already current.');
  }

  if (fetchFailures > 0) {
    console.error(`\n[package-updater] FAILED: ${fetchFailures} registry fetch(es) failed.`);
    return 1;
  }

  return 0;
}
