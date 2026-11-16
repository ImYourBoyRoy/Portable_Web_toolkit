// ./Web_Toolkit/Setup_astro_environment/src/commands/preview-smoke.mjs
/**
 * Launches a local Astro preview server, probes it, and then shuts it down.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { collectChecks, previewCommand } from './setup.mjs';
import { findFreePort, isPortFree, listenerBelongsTo, listenerInfo, startOwned } from '../../../shared/lib/dev-server.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function appendPreviewFlags(command, host, port) {
  if (!command) return '';
  // npm needs `--` before script flags; pnpm, yarn and bun pass them straight through.
  const script = /^(npm|pnpm|yarn|bun)\s+run\s+(preview|dev)\b/i.exec(command.trim());
  if (script) return `${command} ${script[1].toLowerCase() === 'npm' ? '-- ' : ''}--host ${host} --port ${port}`;
  return command;
}

function reportPath(projectRoot) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(projectRoot, 'output', `preview-smoke-${stamp}.json`);
}

// A plain `sh -c` (not a login shell): `-l` would source the user's profile, which can change PATH and the Node version.
// On Windows the whole line is one verbatim argument for cmd.exe so quoted paths survive libuv's argument quoting.
function shellDetails(command) {
  if (process.platform === 'win32') {
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${command}"`], spawnOptions: { windowsVerbatimArguments: true } };
  }
  return { file: 'sh', args: ['-c', command], spawnOptions: {} };
}

/** Polls until the URL answers, the child exits, or time runs out; an answer from a process that is not our child is refused. */
async function waitForUrl(url, timeoutMs, child = null, port = null) {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < timeoutMs) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      return { ok: false, status: 0, error: `The preview command exited (code ${child.exitCode ?? child.signalCode}) before ${url} answered.` };
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      const body = await response.text();
      if (child && port && listenerBelongsTo(port, child.pid) === false) {
        return { ok: false, status: 0, error: `Another process answered on port ${port} before the preview the toolkit started; it was not used. Omit --port to pick a free one.` };
      }
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

export async function runPreviewSmoke(flags = {}) {
  const report = collectChecks(flags);
  const host = String(flags.host || '127.0.0.1');
  // Never assume a port is free (4321/4322 are common dev ports): an explicit --port must be free, otherwise one is chosen.
  let port;
  if (flags.port) {
    port = Number(flags.port);
    if (!(await isPortFree(port, host))) {
      const holder = listenerInfo(port);
      throw new Error(`Port ${port} is already in use${holder ? ` by pid ${holder.pid} (${holder.command || 'unknown'}${holder.cwd ? `, started in ${holder.cwd}` : ''})` : ''}. That process was not started by the toolkit and is left alone; omit --port to pick a free one.`);
    }
  } else {
    const found = await findFreePort({ preferred: 4322, host });
    port = found.port;
    if (found.busy) console.log(`[preview-smoke] port ${found.preferred} is in use by another process (left untouched); using ${port}`);
  }
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
  const { file, args, spawnOptions } = shellDetails(command);
  const server = startOwned({ command: file, args, cwd: report.projectRoot, label: 'preview-smoke', port, startedBy: 'preview-smoke', stdio: ['ignore', 'pipe', 'pipe'], spawnOptions });
  const stdoutChunks = [];
  const stderrChunks = [];
  server.child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  server.child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));

  let probe;
  try {
    probe = await waitForUrl(url, timeoutMs, server.child, flags.url ? null : port);
  } finally {
    await server.stop();
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

