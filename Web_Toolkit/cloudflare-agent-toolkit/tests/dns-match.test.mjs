// ./Web_Toolkit/cloudflare-agent-toolkit/tests/dns-match.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findDnsRecordByNameAndType } from '../src/lib/dns-match.mjs';
import { toBool } from '../src/lib/format.mjs';

describe('findDnsRecordByNameAndType', () => {
  const records = [
    { id: '1', name: 'example.com', type: 'A', content: '1.2.3.4' },
    { id: '2', name: 'example.com', type: 'CNAME', content: 'pages.dev' },
    { id: '3', name: 'www.example.com', type: 'CNAME', content: 'pages.dev' }
  ];

  it('matches by name and type', () => {
    const match = findDnsRecordByNameAndType(records, { name: 'example.com', type: 'CNAME' });
    assert.equal(match?.id, '2');
  });

  it('does not match same name different type', () => {
    const match = findDnsRecordByNameAndType(records, { name: 'example.com', type: 'AAAA' });
    assert.equal(match, undefined);
  });
});

describe('dry-run apply defaults', () => {
  it('toBool(undefined) is false for apply', () => {
    assert.equal(toBool(undefined, false), false);
    assert.equal(toBool(true, false), true);
    assert.equal(toBool('true', false), true);
  });
});
