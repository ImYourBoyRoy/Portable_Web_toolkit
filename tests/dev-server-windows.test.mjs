// Windows-only: process-tree stop through a .cmd shim and ownership of a listener. Skipped on POSIX, where
// tests/dev-server.test.mjs covers process groups. Added after a real Windows run showed the ownership check returned "unknown".
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findFreePort, isPortFree, listenerBelongsTo, listenerInfo, startOwned, waitForUrl } from '../Web_Toolkit/shared/lib/dev-server.mjs';

const WIN = process.platform === 'win32';
const registryFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-win-')), 'owned.json');
const serverCode = (port) => `require('http').createServer((q,r)=>r.end('ok')).listen(${port},'127.0.0.1')`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('an owned server behind the npm .cmd shim answers, belongs to us, and stop() frees the port (whole tree)', { skip: !WIN, timeout: 120_000 }, async () => {
  const { port } = await findFreePort({ preferred: 4431 });
  const server = startOwned({ command: 'npm', args: ['exec', '--yes', '--', 'node', '-e', serverCode(port)], label: 'win-shim', port, registryFile: registryFile() });
  try {
    assert.equal(await waitForUrl(`http://127.0.0.1:${port}/`, 90_000, server.child, { port }), true);
    assert.ok(listenerInfo(port)?.pid, 'the listener is visible');
    assert.equal(listenerBelongsTo(port, server.pid), true, 'the listener is a descendant of the owned shell');
    assert.equal(await isPortFree(port), false);
  } finally {
    await server.stop();
  }
  await sleep(1500);
  assert.equal(await isPortFree(port), true, 'taskkill /T must stop the grandchild that holds the port');
});

test('a listener older than a newer process is foreign (false); a listener is its own root (true)', { skip: !WIN, timeout: 60_000 }, async () => {
  const { port } = await findFreePort({ preferred: 4441 });
  const foreign = spawn(process.execPath, ['-e', serverCode(port)], { stdio: 'ignore', windowsHide: true });
  let newer;
  try {
    for (let i = 0; i < 20 && (await isPortFree(port)); i += 1) await sleep(300);
    newer = spawn(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { stdio: 'ignore', windowsHide: true });
    await sleep(800);
    assert.equal(listenerBelongsTo(port, foreign.pid), true);
    assert.equal(listenerBelongsTo(port, newer.pid), false);
  } finally {
    foreign.kill();
    newer?.kill();
  }
});
