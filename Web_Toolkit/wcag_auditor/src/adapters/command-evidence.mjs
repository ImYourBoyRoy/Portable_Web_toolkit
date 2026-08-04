import path from 'node:path';
import { spawn } from 'node:child_process';
import { AdapterError } from '../core/errors.mjs';
import { readJsonFile } from '../core/filesystem.mjs';
import { parseNativeEvidenceDocument } from './native-evidence.mjs';

export async function runCommandEvidenceAdapter(config, context) {
  if (typeof config.command !== 'string' || config.command.trim() === '') {
    throw new AdapterError('command-evidence adapter requires command');
  }
  if (config.args !== undefined && !Array.isArray(config.args)) {
    throw new AdapterError('command-evidence args must be an array');
  }

  const cwd = path.resolve(context.projectRoot, config.cwd ?? '.');
  const timeoutMs = positiveInteger(config.timeoutMs, 120_000, 'timeoutMs');
  const maxOutputBytes = positiveInteger(config.maxOutputBytes, 10 * 1024 * 1024, 'maxOutputBytes');
  const result = await runCommand(config.command, config.args ?? [], {
    cwd,
    env: { ...process.env, ...(config.env ?? {}) },
    timeoutMs,
    maxOutputBytes
  });

  if (result.exitCode !== 0) {
    throw new AdapterError(`Evidence command exited with code ${result.exitCode}: ${config.command}`, {
      command: config.command,
      exitCode: result.exitCode,
      signal: result.signal,
      stderr: result.stderr.slice(-4000)
    });
  }

  let document;
  if (config.outputFile) {
    document = await readJsonFile(path.resolve(cwd, config.outputFile));
  } else {
    try {
      document = JSON.parse(result.stdout);
    } catch (error) {
      throw new AdapterError('Evidence command stdout was not valid JSON', {
        stdout: result.stdout.slice(0, 4000),
        stderr: result.stderr.slice(-4000)
      }, error);
    }
  }

  const parsed = parseNativeEvidenceDocument(document);
  return {
    findings: parsed.findings.map((finding) => ({
      ...finding,
      target: { ...finding.target, adapter: context.adapterName },
      tags: ['command-evidence', parsed.producer.kind, ...(finding.tags ?? [])]
    })),
    surfaceCount: parsed.surfaceCount,
    metadata: {
      producer: parsed.producer,
      command: config.command,
      durationMs: result.durationMs,
      stderr: config.captureStderr ? result.stderr : undefined
    }
  };
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(command, args.map(String), {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000).unref();
      finishReject(new AdapterError(`Evidence command timed out after ${options.timeoutMs} ms`, { command }));
    }, options.timeoutMs);
    timer.unref();

    function capture(target, chunk) {
      outputBytes += chunk.length;
      if (outputBytes > options.maxOutputBytes) {
        child.kill('SIGKILL');
        finishReject(new AdapterError(`Evidence command exceeded maxOutputBytes=${options.maxOutputBytes}`, { command }));
        return target;
      }
      return target + chunk.toString('utf8');
    }

    function finishReject(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }

    child.stdout.on('data', (chunk) => { stdout = capture(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = capture(stderr, chunk); });
    child.on('error', (error) => finishReject(new AdapterError(`Unable to start evidence command: ${error.message}`, { command }, error)));
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, signal, stdout, stderr, durationMs: Date.now() - started });
    });
  });
}

function positiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) throw new AdapterError(`${name} must be a positive integer`);
  return value;
}
