// ./Web_Toolkit/cloudflare-agent-toolkit/tests/safety.test.mjs
/**
 * Offline tests for Cloudflare mutation safety.
 * Run: node --test ./tests/safety.test.mjs
 * Covers: zone-harden dry-run resolution, cf-agent boolean flag parsing, typed zone-not-found.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { resolveDryRun } from '../src/commands/zone-harden.mjs';
import { parseCliArgs } from '../src/lib/cli.mjs';
import { ZoneNotFoundError, resolveZoneByName } from '../src/lib/cloudflare-api.mjs';

describe('zone-harden dry-run resolution', () => {
  it('defaults to dry-run without --apply', () => {
    assert.equal(resolveDryRun({}), true);
  });

  it('mutates only with --apply', () => {
    assert.equal(resolveDryRun({ apply: true }), false);
    assert.equal(resolveDryRun({ apply: 'true' }), false);
  });

  it('--dry-run=false alone does not enable mutation', () => {
    assert.equal(resolveDryRun({ 'dry-run': 'false' }), true);
  });

  it('--dry-run wins over --apply, and junk values fail safe', () => {
    assert.equal(resolveDryRun({ apply: true, 'dry-run': true }), true);
    assert.equal(resolveDryRun({ apply: true, 'dry-run': 'nope' }), true);
  });

  it('explicit --dry-run=false with --apply mutates (site-harden contract)', () => {
    assert.equal(resolveDryRun({ apply: true, 'dry-run': false }), false);
  });
});

describe('cf-agent parser', () => {
  it('--dry-run does not swallow the next token', () => {
    const { command, flags } = parseCliArgs(['site', '--dry-run', 'harden']);
    assert.equal(flags['dry-run'], true);
    assert.deepEqual(command, ['site', 'harden']);
  });
});

describe('resolveZoneByName', () => {
  it('throws ZoneNotFoundError only when the API returns no zones', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response(JSON.stringify({ success: true, result: [] }), { status: 200 }));
    try {
      await assert.rejects(() => resolveZoneByName('t', 'example.com'), ZoneNotFoundError);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('propagates auth failures as plain errors, not ZoneNotFoundError', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'Invalid token' }] }), { status: 403 }));
    try {
      await assert.rejects(() => resolveZoneByName('t', 'example.com'), (error) => {
        assert.ok(!(error instanceof ZoneNotFoundError));
        assert.match(error.message, /Invalid token|403/);
        return true;
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});
