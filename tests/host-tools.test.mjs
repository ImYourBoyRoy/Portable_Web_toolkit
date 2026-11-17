// Host setup policy: nothing pins a Node version, Node resolves from nodejs.org at run time, pnpm is core, Enchi replaces pyenv-native.
// The shell and PowerShell resolvers run against a stubbed nodejs.org, so no network is needed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolkit = path.join(root, 'Web_Toolkit');
const manifestPath = path.join(toolkit, 'Setup_agent_environment/config/host-bootstrap.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const POSIX = process.platform !== 'win32';
const hasBash = POSIX && spawnSync('bash', ['--version']).status === 0;
const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major']).status === 0;

const FAKE_LATEST = '26.99.0';
const tag = `${process.platform === 'darwin' ? 'darwin' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
const shasums = [
  `${'a'.repeat(64)}  node-v${FAKE_LATEST}-${tag}.tar.gz`,
  `${'b'.repeat(64)}  node-v${FAKE_LATEST}-${tag}.tar.xz`,
  `${'c'.repeat(64)}  node-v${FAKE_LATEST}-x64.msi`,
  `${'d'.repeat(64)}  node-v${FAKE_LATEST}-arm64.msi`
].join('\n');

function sandbox({ nodeVersion, offline = false } = {}) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'host-tools-'));
  const write = (name, body) => { fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 }); };
  write('curl', offline ? 'exit 22' : `case "$*" in *SHASUMS256.txt*) cat <<'EOS'\n${shasums}\nEOS\n;; *) exit 22 ;; esac`);
  if (nodeVersion) write('node', nodeVersion === 'broken' ? 'exit 1' : `echo v${nodeVersion}`);
  return bin;
}

const sh = (script, bin) => spawnSync('bash', ['-c', `source "${toolkit}/scripts/lib/host-tools.sh"; ${script}`], {
  encoding: 'utf8',
  env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MANIFEST_PATH: manifestPath, TOOLKIT_ROOT: toolkit, HOME: bin }
});

test('the manifest names no Node, pnpm or Enchi version to install, and no version-specific download URL', () => {
  const text = fs.readFileSync(manifestPath, 'utf8');
  assert.doesNotMatch(text, /nodejs\.org\/dist\/v\d/, 'a version-specific Node URL is a pin');
  assert.doesNotMatch(text, /tarball_url|required_version/);
  assert.equal(manifest['tool.node.dist_base'], 'https://nodejs.org/dist');
  assert.match(manifest['tool.node.major'], /^\d+$/);
  for (const key of Object.keys(manifest)) assert.doesNotMatch(key, /^tool\.pyenv/, `${key} still uses the pre-rename name`);
  assert.ok(manifest['tool.enchi.minimum_version'] && manifest['tool.pnpm.minimum_version']);
});

test('pnpm is a core tool, not an optional one; Enchi release assets are not hard-coded per OS', () => {
  assert.ok(!manifest['tool.optional.order'].split(',').includes('pnpm'));
  assert.ok(manifest['tool.pnpm.posix.install_url'] && manifest['tool.pnpm.windows.package_id']);
  assert.ok(!Object.keys(manifest).some((key) => /download_url$/.test(key)));
});

test('.node-version is a bare major, so CI and setup resolve the latest release instead of a pin', () => {
  for (const file of ['.node-version', 'site-starter/.node-version']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8').trim(), /^\d+$/, file);
  }
});

test('shell: the latest release of the required major is read from the checksum file', { skip: !hasBash }, () => {
  const bin = sandbox();
  const result = sh('resolve_latest_node && printf "%s|%s|%s" "$NODE_LATEST_VERSION" "$NODE_LATEST_URL" "$NODE_LATEST_SHA256"', bin);
  assert.equal(result.status, 0, result.stderr);
  const [version, url, sha] = result.stdout.split('|');
  const ext = process.platform === 'darwin' ? 'tar.gz' : 'tar.xz';
  assert.equal(version, FAKE_LATEST);
  assert.equal(url, `https://nodejs.org/dist/latest-v26.x/node-v${FAKE_LATEST}-${tag}.${ext}`);
  assert.equal(sha, (ext === 'tar.gz' ? 'a' : 'b').repeat(64));
});

test('shell: node_needs_install follows the policy (major floor, latest patch of that major, newer major accepted, offline never forces)', { skip: !hasBash }, () => {
  const needs = (nodeVersion, offline = false) => sh('node_needs_install; echo $?', sandbox({ nodeVersion, offline })).stdout.trim().split('\n').pop() === '0';
  assert.equal(needs('broken'), true, 'a node that does not run counts as missing');
  assert.equal(needs('25.9.0'), true, 'below the required major');
  assert.equal(needs('26.1.0'), true, 'behind the latest patch of the major');
  assert.equal(needs(FAKE_LATEST), false, 'already the latest');
  assert.equal(needs('27.0.0'), false, 'a newer major than required is accepted');
  assert.equal(needs('26.1.0', true), false, 'offline never forces an update');
});

test('shell: node_major comes from .node-version', { skip: !hasBash }, () => {
  const result = sh('node_major', sandbox());
  assert.equal(result.stdout.trim(), fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim());
});

test('PowerShell: the same resolution and policy against a stubbed nodejs.org', { skip: !hasPwsh, timeout: 60_000 }, () => {
  // Strict mode like bootstrap.ps1 and setup-interactive.ps1: an unset variable must not be read.
  const script = `
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ToolkitRoot = '${toolkit.replace(/'/g, "''")}'
$ManifestPath = '${manifestPath.replace(/'/g, "''")}'
function Invoke-WebRequest { param($Uri, $OutFile, [switch]$UseBasicParsing, $TimeoutSec) [pscustomobject]@{ Content = @'
${shasums}
'@ } }
. (Join-Path $ToolkitRoot 'scripts/lib/host-tools.ps1')
$m = Get-Manifest
$latest = Resolve-LatestNode $m
"major=$(Get-NodeMajor $m)"
"version=$($latest.Version)"
"file=$($latest.File)"
"sha=$($latest.Sha256)"
"cmp=$(Compare-Version '26.1.0' '${FAKE_LATEST}')"`;
  const result = spawnSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const out = Object.fromEntries(result.stdout.trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
  assert.equal(out.major, fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim());
  assert.equal(out.version, FAKE_LATEST);
  assert.match(out.file, /^node-v26\.99\.0-(x64|arm64)\.msi$/);
  assert.equal(out.sha, (out.file.includes('arm64') ? 'd' : 'c').repeat(64));
  assert.equal(out.cmp, '-1');
});

test('the Node doctor reads the number after the tool name, not a version inside a path (pip 26.3 from .../3.15.2/...)', async () => {
  const { parseVersion } = await import(pathToFileURL(path.join(toolkit, 'Setup_agent_environment/src/commands/setup.mjs')).href);
  assert.deepEqual(parseVersion('pip 26.3 from /home/me/.enchi/versions/3.15.2/lib/python3.15/site-packages/pip (python 3.15)'), [26, 3, 0]);
  assert.deepEqual(parseVersion('enchi 0.8.0'), [0, 8, 0]);
  assert.deepEqual(parseVersion('Python 3.15.2'), [3, 15, 2]);
  assert.deepEqual(parseVersion('git version 2.53.0'), [2, 53, 0]);
  assert.deepEqual(parseVersion('v26.13.1'), [26, 13, 1]);
});

test('the POSIX scripts use no bash 4-only syntax (stock macOS ships bash 3.2, where ${var,,} aborts bootstrap)', () => {
  const dirs = [path.join(toolkit, 'scripts'), root];
  const files = [];
  for (const dir of dirs) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: dir === path.join(toolkit, 'scripts') })) {
      if (entry.isFile() && /\.(sh|command)$/.test(entry.name) && !entry.parentPath?.includes('node_modules')) files.push(path.join(entry.parentPath ?? dir, entry.name));
    }
  }
  assert.ok(files.length >= 4, 'the script set was not found');
  const bash4 = /\$\{[^}]*(,,|\^\^)[^}]*\}|declare\s+-A|\bmapfile\b|\breadarray\b|\blocal\s+-n\b|&>>|\|&/;
  const offenders = [];
  for (const file of new Set(files)) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (!line.trim().startsWith('#') && bash4.test(line)) offenders.push(`${path.relative(root, file)}:${index + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('no PowerShell script declares a parameter named $Args (it shadows the automatic variable and silently drops every argument)', () => {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.runtime') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ps1')) {
        fs.readFileSync(full, 'utf8').split('\n').forEach((line, index) => {
          if (!line.trim().startsWith('#') && /\[[^\]]*\]\s*\$Args\b|param\s*\([^)]*\$Args\b/i.test(line)) found.push(`${path.relative(root, full)}:${index + 1}`);
        });
      }
    }
  };
  walk(root);
  assert.deepEqual(found, []);
});
