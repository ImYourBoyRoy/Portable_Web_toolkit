// ./tests/shared-cli.test.mjs
/**
 * Offline tests for the shared CLI parser used by every portable tool.
 * Run: node --test ./tests/shared-cli.test.mjs
 * Covers: boolean flags keeping the command, --key=value, `--` terminator, and a
 * guard that every flag documented without a <value> in tool help is boolean.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isBooleanFlag, parseCliArgs } from '../Web_Toolkit/shared/lib/cli.mjs';

const toolkit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'Web_Toolkit');

test('boolean flag before the command does not swallow it', () => {
  const { command, flags } = parseCliArgs(['--skip-cloudflare', 'run', '--site-profile', 'p.json']);
  assert.deepEqual(command, ['run']);
  assert.equal(flags['skip-cloudflare'], true);
  assert.equal(flags['site-profile'], 'p.json');
});

test('dry-run and json do not swallow positionals', () => {
  const { command, flags } = parseCliArgs(['--dry-run', 'scan', '--json', 'extra']);
  assert.deepEqual(command, ['scan', 'extra']);
  assert.equal(flags['dry-run'], true);
  assert.equal(flags.json, true);
});

test('--key=value is a value, not a flag named "key=value"', () => {
  const { flags } = parseCliArgs(['scan', '--root=./site', '--title=']);
  assert.equal(flags.root, './site');
  assert.equal(flags.title, '');
  assert.equal(flags['root=./site'], undefined);
});

test('value flags consume the next token; missing value becomes true', () => {
  assert.equal(parseCliArgs(['--root', '.']).flags.root, '.');
  assert.equal(parseCliArgs(['--root']).flags.root, true);
  assert.equal(parseCliArgs(['--root', '--json']).flags.root, true);
});

test('tool-specific boolean flags can be declared', () => {
  const { command, flags } = parseCliArgs(['--my-switch', 'go'], { booleanFlags: ['my-switch'] });
  assert.deepEqual(command, ['go']);
  assert.equal(flags['my-switch'], true);
});

test('-- ends flag parsing', () => {
  const { command, flags, rest } = parseCliArgs(['run', '--', '--literal', 'x']);
  assert.deepEqual(command, ['run']);
  assert.deepEqual(flags, {});
  assert.deepEqual(rest, ['--literal', 'x']);
});

test('every flag documented without a <value> in tool help is boolean', () => {
  const missing = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.runtime', 'tests'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.mjs')) {
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(/name:\s*'(--[a-z0-9-]+)'/g)) {
          if (!isBooleanFlag(match[1].slice(2))) missing.add(match[1]);
        }
      }
    }
  };
  walk(toolkit);
  assert.deepEqual([...missing], [], 'add these to DEFAULT_BOOLEAN_FLAGS or document a <value>');
});
