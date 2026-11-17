// Host setup policy: nothing pins a Node version, Node resolves from nodejs.org at run time, pnpm is core, Enchi replaces pyenv-native.
// The shell and PowerShell resolvers run against a stubbed nodejs.org, so no network is needed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
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
  `${'b'.repeat(64)}  node-v${FAKE_LATEST}-${tag}.tar.xz`, // a lookalike the resolver must never pick
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
  const ext = 'tar.gz';
  assert.equal(version, FAKE_LATEST);
  assert.equal(url, `https://nodejs.org/dist/latest-v26.x/node-v${FAKE_LATEST}-${tag}.${ext}`);
  assert.equal(sha, 'a'.repeat(64), 'the .tar.gz is chosen, never the .tar.xz lookalike');
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

test('the Rust engine pins no dependency: every Cargo.toml requirement is a range', () => {
  const toml = fs.readFileSync(path.join(toolkit, 'setup_engine/Cargo.toml'), 'utf8');
  const deps = toml.split('[dependencies]')[1].split(/\n\[/)[0];
  const requirements = [...deps.matchAll(/(?:^|\s)(?:version\s*=\s*)?"([^"]+)"/gm)].map((m) => m[1]).filter((v) => /\d/.test(v));
  assert.ok(requirements.length >= 4);
  for (const requirement of requirements) assert.match(requirement, /^[\^~]|^>=|\*/, `${requirement} is an exact pin`);
  assert.ok(fs.existsSync(path.join(toolkit, 'setup_engine/Cargo.lock')), 'Cargo.lock records what was resolved');
});

function engineSandbox({ checksumMatches = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-launcher-'));
  const toolkitRoot = path.join(base, 'Web_Toolkit');
  fs.mkdirSync(path.join(toolkitRoot, 'Setup_agent_environment/config'), { recursive: true });
  fs.writeFileSync(path.join(base, 'VERSION'), '9.9.9\n');
  fs.copyFileSync(manifestPath, path.join(toolkitRoot, 'Setup_agent_environment/config/host-bootstrap.manifest.json'));
  const bin = path.join(base, 'bin');
  fs.mkdirSync(bin);
  // A runnable stand-in: the launcher refuses an engine whose `--version` does not succeed.
  const body = '#!/bin/sh\nexit 0\n';
  const sha = checksumMatches ? createHash('sha256').update(body).digest('hex') : '0'.repeat(64);
  fs.writeFileSync(path.join(bin, 'curl'), `#!/bin/sh
out=""; url=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; --max-time|--retry) shift 2;; -*) shift;; *) url="$1"; shift;; esac; done
case "$url" in
  *v9.9.9/toolkit-setup-*.sha256) echo "${sha}  asset" ;;
  *v9.9.9/toolkit-setup-*) printf '#!/bin/sh\\nexit 0\\n' > "$out" ;;
  *) exit 22 ;;
esac
`, { mode: 0o755 });
  return { base, toolkitRoot, bin };
}

const engineSh = (script, { toolkitRoot, bin }, extraEnv = {}) => spawnSync('bash', ['-c', `source "${toolkit}/scripts/lib/host-tools.sh"; ${script}`], {
  encoding: 'utf8',
  env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MANIFEST_PATH: manifestPath, TOOLKIT_ROOT: toolkitRoot, ...extraEnv }
});

test('launcher: fetch_engine downloads the asset for this version, verifies its SHA-256, and find_engine then returns it', { skip: !hasBash }, () => {
  const box = engineSandbox();
  assert.notEqual(engineSh('find_engine', box).status, 0, 'no engine yet');
  const fetched = engineSh('fetch_engine', box);
  assert.equal(fetched.status, 0, fetched.stderr);
  const found = engineSh('find_engine', box);
  assert.equal(found.stdout.trim(), path.join(box.toolkitRoot, '.runtime/bin/toolkit-setup'));
  assert.equal(fs.readFileSync(found.stdout.trim(), 'utf8'), '#!/bin/sh\nexit 0\n');
  assert.ok(fs.statSync(found.stdout.trim()).mode & 0o111, 'the engine is executable');
});

test('launcher: a download that fails its checksum is deleted and the scripts take over', { skip: !hasBash }, () => {
  const box = engineSandbox({ checksumMatches: false });
  assert.notEqual(engineSh('fetch_engine', box).status, 0);
  assert.equal(fs.existsSync(path.join(box.toolkitRoot, '.runtime/bin/toolkit-setup')), false);
  assert.equal(fs.existsSync(path.join(box.toolkitRoot, '.runtime/bin/toolkit-setup.part')), false);
  assert.notEqual(engineSh('find_engine', box).status, 0);
});

test('launcher: TOOLKIT_SETUP_LEGACY=1 ignores an installed engine', { skip: !hasBash }, () => {
  const box = engineSandbox();
  engineSh('fetch_engine', box);
  assert.equal(engineSh('find_engine', box).status, 0);
  assert.notEqual(engineSh('find_engine', box, { TOOLKIT_SETUP_LEGACY: '1' }).status, 0);
});

test('PowerShell and batch scripts are pure ASCII (Windows PowerShell 5.1 reads a BOM-less file as Windows-1252, where an em dash breaks the string)', () => {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.runtime', 'target'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ps1|bat|cmd)$/i.test(entry.name)) {
        fs.readFileSync(full).forEach((byte, index, bytes) => { if (byte > 127 && (index === 0 || bytes[index - 1] <= 127)) found.push(`${path.relative(root, full)} @ byte ${index}`); });
      }
    }
  };
  walk(root);
  assert.deepEqual(found, []);
});

test('PowerShell: setup-interactive.ps1 runs end to end up to the confirmation and a "n" changes nothing (the real script, strict mode)', { skip: !hasPwsh, timeout: 90_000 }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-home-'));
  const result = spawnSync('pwsh', ['-NoProfile', '-File', path.join(toolkit, 'scripts/setup-interactive.ps1'), '-Workspace', home], {
    encoding: 'utf8',
    input: 'n\n',
    // PNPM_HOME is empty on purpose: unset or empty variables are the common case and must never make the scan throw.
    env: { ...process.env, TOOLKIT_SETUP_LEGACY: '1', TOOLKIT_SETUP_OFFLINE: '1', USERPROFILE: home, LOCALAPPDATA: home, PNPM_HOME: '' }
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Local Agent Environment/);
  assert.match(result.stdout, /Cancelled - no changes made|Nothing to install/);
  assert.doesNotMatch(result.stderr, /could not be loaded|ParserError|is not recognized/);
});

test('PowerShell: a checksum file served as a byte array is decoded to text before it is compared', { skip: !hasPwsh, timeout: 60_000 }, () => {
  const hash = 'ab'.repeat(32);
  const script = `
Set-StrictMode -Version Latest
$ToolkitRoot = '${toolkit.replace(/'/g, "''")}'
$ManifestPath = '${manifestPath.replace(/'/g, "''")}'
function Invoke-WebRequest { param($Uri, [switch]$UseBasicParsing) [pscustomobject]@{ Content = [Text.Encoding]::ASCII.GetBytes('${hash}  toolkit-setup-linux-x64' + [char]10) } }
. (Join-Path $ToolkitRoot 'scripts/lib/host-tools.ps1')
((Get-WebText 'https://example.invalid/x.sha256') -split '\\s+' | Where-Object { $_ } | Select-Object -First 1)`;
  const result = spawnSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), hash, 'a byte[] .Content must not be split into byte values');
});

test('launcher: a downloaded engine is used only for the toolkit version it was fetched for', { skip: !hasBash }, () => {
  const box = engineSandbox();
  engineSh('fetch_engine', box);
  const exe = path.join(box.toolkitRoot, '.runtime/bin/toolkit-setup');
  fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.equal(fs.readFileSync(`${exe}.version`, 'utf8').trim(), '9.9.9', 'the sidecar records the toolkit version');
  assert.equal(engineSh('find_engine', box).status, 0, 'current version, healthy engine');
  fs.writeFileSync(`${exe}.version`, '9.9.8\n');
  assert.notEqual(engineSh('find_engine', box).status, 0, 'an engine fetched for an older toolkit is stale and ignored');
  fs.rmSync(`${exe}.version`);
  assert.notEqual(engineSh('find_engine', box).status, 0, 'no sidecar, no trust');
});

test('launcher: an engine that cannot start is skipped so the scripts take over', { skip: !hasBash }, () => {
  const box = engineSandbox();
  engineSh('fetch_engine', box);
  const exe = path.join(box.toolkitRoot, '.runtime/bin/toolkit-setup');
  fs.writeFileSync(exe, '#!/bin/sh\nexit 127\n', { mode: 0o755 });
  assert.notEqual(engineSh('find_engine', box).status, 0, 'a broken engine never wins over the scripts');
});
