import assert from 'node:assert/strict';
import test from 'node:test';

import { collectWarmUrls } from '../Web_Toolkit/cache_purge/src/commands/warm.mjs';

test('collectWarmUrls builds host + qualitySmoke route URLs', () => {
  const urls = collectWarmUrls({
    productionHosts: ['example.com'],
    developmentHosts: ['dev.example.com'],
    profile: {
      diagnostics: {
        qualitySmoke: {
          routes: ['/', '/about'],
        },
      },
    },
  });
  assert.deepEqual(urls, [
    'https://example.com/',
    'https://example.com/about',
    'https://dev.example.com/',
    'https://dev.example.com/about',
  ]);
});

test('collectWarmUrls defaults to root route', () => {
  const urls = collectWarmUrls({
    productionHosts: ['example.com'],
    developmentHosts: [],
    profile: {},
  });
  assert.deepEqual(urls, ['https://example.com/']);
});
