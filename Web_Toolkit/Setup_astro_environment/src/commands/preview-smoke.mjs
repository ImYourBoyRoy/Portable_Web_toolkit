// ./Web_Toolkit/Setup_astro_environment/src/commands/preview-smoke.mjs
/**
 * Launches a local Astro preview server, probes it, and then shuts it down.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { collectChecks, previewCommand } from './setup.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function appendPreviewFlags(command, host, port) {
  if (!command) return '';
  if (/npm\s+run\s+preview/i.test(command)) {
    return `${command} -- --host ${host} --port ${port}`;
  }
  if (/npm\s+run\s+dev/i.test(command)) {
    return `${command} -- --host ${host} --port ${port}`;
  }
  return command;
}

function reportPath(projectRoot) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(projectRoot, 'output', `preview-smoke-${stamp}.json`);
}

function shellDetails(command) {
  if (process.platform === 'win32') {
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', command] };
  }
  return { file: 'sh', args: ['-lc', command] };
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      const body = await response.text();
      return {
        ok: response.status >= 200 && response.status < 500,
        status: response.status,
        title: body.match(/<title>(.*?)<\/title>/i)?.[1] || '',
        bodySample: body.slice(0, 200)
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return { ok: false, status: 0, error: lastError || `Timeout waiting for ${url}` };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }
  child.kill('SIGTERM');
}

export async function runPreviewSmoke(flags = {}) {
  const report = collectChecks(flags);
  const host = String(flags.host || '127.0.0.1');
  const port = Number(flags.port || 4322);
  const timeoutMs = Number(flags['timeout-ms'] || 120000);
  const url = String(flags.url || `http://${host}:${port}`);
  const baseCommand = String(flags.command || previewCommand(report)).trim();
  if (!baseCommand) {
    throw new Error('No preview command found. Add commands.preview to the site profile or a preview/dev script to package.json.');
  }

  const command = appendPreviewFlags(baseCommand, host, port);
  const logDir = path.join(report.projectRoot, 'output');
  const outPath = path.join(logDir, 'preview-smoke.stdout.log');
  const errPath = path.join(logDir, 'preview-smoke.stderr.log');
  fs.mkdirSync(logDir, { recursive: true });
  const { file, args } = shellDetails(command);
  const child = spawn(file, args, {
    cwd: report.projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));

  let probe;
  try {
    probe = await waitForUrl(url, timeoutMs);
  } finally {
    await stopChild(child);
  }

  fs.writeFileSync(outPath, Buffer.concat(stdoutChunks).toString('utf8'), 'utf8');
  fs.writeFileSync(errPath, Buffer.concat(stderrChunks).toString('utf8'), 'utf8');
  const smokeReport = {
    checkedAt: new Date().toISOString(),
    projectRoot: report.projectRoot,
    url,
    command,
    logs: { stdout: outPath, stderr: errPath },
    probe
  };
  const jsonPath = reportPath(report.projectRoot);
  fs.writeFileSync(jsonPath, `${JSON.stringify(smokeReport, null, 2)}\n`, 'utf8');

  console.log('\nAstro preview smoke');
  console.log(`- Project root: ${report.projectRoot}`);
  console.log(`- URL: ${url}`);
  console.log(`- Command: ${command}`);
  console.log(`- Status: ${probe.ok ? 'PASS' : 'FAIL'}`);
  console.log(`- Report: ${jsonPath}`);
  console.log(`- Logs: ${outPath} | ${errPath}`);

  if (toBool(flags.json, false)) {
    process.stdout.write(`${JSON.stringify(smokeReport, null, 2)}\n`);
  }

  return probe.ok ? 0 : 2;
}

