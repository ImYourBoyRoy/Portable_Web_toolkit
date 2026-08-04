import path from 'node:path';
import { spawn } from 'node:child_process';
import { AdapterError } from './errors.mjs';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 150;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

export async function startManagedWebServer(config, context, fallbackURL) {
  if (!config) {
    return {
      metadata: null,
      close: async () => {}
    };
  }

  validateWebServerRuntimeConfig(config);
  const readyURL = config.url ?? fallbackURL;
  if (!readyURL) throw new AdapterError('webServer requires url when the adapter has no baseURL');

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const requestTimeoutMs = Math.min(config.requestTimeoutMs ?? 1_500, timeoutMs);
  const reuseExistingServer = config.reuseExistingServer ?? true;

  if (reuseExistingServer && await isServerReady(readyURL, requestTimeoutMs)) {
    return {
      metadata: { readyURL, reused: true, command: null },
      close: async () => {}
    };
  }

  const cwd = path.resolve(context.projectRoot, config.cwd ?? '.');
  const output = createOutputCollector(config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES);
  let child;
  try {
    child = spawn(config.command, config.args ?? [], {
      cwd,
      env: { ...process.env, ...(config.env ?? {}) },
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    throw new AdapterError(`Unable to start web server command: ${error.message}`, { command: config.command, cwd }, error);
  }

  child.stdout?.on('data', (chunk) => output.append('stdout', chunk));
  child.stderr?.on('data', (chunk) => output.append('stderr', chunk));

  try {
    await waitForServerReady({
      child,
      readyURL,
      timeoutMs,
      pollIntervalMs,
      requestTimeoutMs,
      output
    });
  } catch (error) {
    await stopProcessTree(child, config.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS);
    throw error;
  }

  let closed = false;
  return {
    metadata: {
      readyURL,
      reused: false,
      command: config.command,
      args: config.args ?? [],
      cwd
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await stopProcessTree(child, config.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS);
    }
  };
}

export function validateWebServerRuntimeConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new AdapterError('webServer must be an object');
  }
  if (typeof config.command !== 'string' || config.command.trim() === '') {
    throw new AdapterError('webServer.command must be a non-empty string');
  }
  if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some((arg) => typeof arg !== 'string'))) {
    throw new AdapterError('webServer.args must be an array of strings');
  }
  if (config.env !== undefined && (!config.env || typeof config.env !== 'object' || Array.isArray(config.env)
    || Object.values(config.env).some((value) => typeof value !== 'string'))) {
    throw new AdapterError('webServer.env must contain only string values');
  }
  for (const field of ['timeoutMs', 'pollIntervalMs', 'requestTimeoutMs', 'shutdownTimeoutMs', 'maxOutputBytes']) {
    if (config[field] !== undefined && (!Number.isInteger(config[field]) || config[field] < 1)) {
      throw new AdapterError(`webServer.${field} must be a positive integer`);
    }
  }
  if (config.reuseExistingServer !== undefined && typeof config.reuseExistingServer !== 'boolean') {
    throw new AdapterError('webServer.reuseExistingServer must be boolean');
  }
}

async function waitForServerReady({ child, readyURL, timeoutMs, pollIntervalMs, requestTimeoutMs, output }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new AdapterError(
        `Web server exited before becoming ready at ${readyURL}.${formatCapturedOutput(output)}`,
        { exitCode: child.exitCode, signal: child.signalCode, readyURL }
      );
    }
    if (await isServerReady(readyURL, requestTimeoutMs)) return;
    await delay(pollIntervalMs);
  }
  throw new AdapterError(
    `Timed out after ${timeoutMs} ms waiting for web server at ${readyURL}.${formatCapturedOutput(output)}`,
    { readyURL, timeoutMs }
  );
}

async function isServerReady(url, requestTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'wcag-auditor-web-server-probe' }
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function stopProcessTree(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  sendSignal(child, 'SIGTERM');
  if (await waitForExit(child, timeoutMs)) return;
  sendSignal(child, 'SIGKILL');
  await waitForExit(child, Math.min(timeoutMs, 1_000));
}

function sendSignal(child, signal) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    timer.unref?.();
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
    };
    child.once('exit', onExit);
  });
}

function createOutputCollector(maxBytes) {
  const state = { stdout: '', stderr: '', bytes: 0, truncated: false };
  return {
    append(stream, chunk) {
      if (state.bytes >= maxBytes) {
        state.truncated = true;
        return;
      }
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      const remaining = maxBytes - state.bytes;
      const accepted = Buffer.from(text).subarray(0, remaining).toString('utf8');
      state[stream] += accepted;
      state.bytes += Buffer.byteLength(accepted);
      if (Buffer.byteLength(text) > remaining) state.truncated = true;
    },
    snapshot() {
      return { ...state };
    }
  };
}

function formatCapturedOutput(output) {
  const captured = output.snapshot();
  const sections = [];
  if (captured.stdout.trim()) sections.push(`\nstdout:\n${captured.stdout.trim()}`);
  if (captured.stderr.trim()) sections.push(`\nstderr:\n${captured.stderr.trim()}`);
  if (captured.truncated) sections.push('\n[server output truncated]');
  return sections.join('');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
