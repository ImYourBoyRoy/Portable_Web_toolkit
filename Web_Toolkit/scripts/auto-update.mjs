#!/usr/bin/env node
// ./Web_Toolkit/scripts/auto-update.mjs
/**
 * Run the throttled toolkit/WCAGate freshness preflight explicitly.
 * Normal toolkit commands invoke the same preflight automatically.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maybeAutoUpdate } from '../shared/lib/auto-update.mjs';

const toolkitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const report = maybeAutoUpdate({
  portableRoot: toolkitRoot,
  force: argv.includes('--force'),
  json: argv.includes('--json')
});

if (report.status === 'disabled') {
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.error(`[toolkit-auto-update] ${report.reason}`);
}

if (report.status === 'throttled') {
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.error(`[toolkit-auto-update] throttled; next check ${report.nextCheckAt}.`);
}

if ([report.toolkit, report.wcagate].some((result) => result?.status === 'error')) {
  process.exitCode = 2;
}
