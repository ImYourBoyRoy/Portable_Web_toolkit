import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { buildAstroConfigObject, resolveManagedServerPort } from '../src/toolkit/profile-config.mjs';

const profile = (preview) => ({ siteId: 'x', commands: { preview }, diagnostics: { wcagAuditor: { baseURL: 'http://127.0.0.1:4321', manageServer: true } } });
const server = (config) => config.adapters.find((adapter) => adapter.type === 'playwright-axe');

test('a managed preview runs on the chosen port, is owned, and is never reused', () => {
  for (const [preview, expected] of [
    ['npm run preview', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '5055']],
    ['pnpm run preview', ['run', 'preview', '--host', '127.0.0.1', '--port', '5055']]
  ]) {
    const config = buildAstroConfigObject({ profile: profile(preview), projectRoot: '/tmp/x', flags: {}, managedServerPort: { port: 5055, preferred: 4321, busy: true } });
    const adapter = server(config);
    assert.equal(adapter.baseURL, 'http://127.0.0.1:5055');
    assert.equal(adapter.webServer.url, 'http://127.0.0.1:5055');
    assert.deepEqual(adapter.webServer.args, expected);
    assert.equal(adapter.webServer.reuseExistingServer, false);
  }
});

test('without a chosen port the configured server and reuse behavior are unchanged', () => {
  const adapter = server(buildAstroConfigObject({ profile: profile('pnpm run preview'), projectRoot: '/tmp/x', flags: {} }));
  assert.equal(adapter.baseURL, 'http://127.0.0.1:4321');
  assert.deepEqual(adapter.webServer.args, ['run', 'preview']);
  assert.equal(adapter.webServer.reuseExistingServer, true);
});

test('resolveManagedServerPort moves off a busy port and stays out of the way when no server is managed', async () => {
  const holder = net.createServer();
  await new Promise((resolve) => holder.listen(0, '127.0.0.1', resolve));
  const busy = holder.address().port;
  try {
    const live = { siteId: 'x', commands: { preview: 'npm run preview' }, diagnostics: { wcagAuditor: { baseURL: `http://127.0.0.1:${busy}`, manageServer: true } } };
    const chosen = await resolveManagedServerPort({ profile: live, flags: {} });
    assert.equal(chosen.busy, true);
    assert.notEqual(chosen.port, busy);
    assert.equal(await resolveManagedServerPort({ profile: { ...live, diagnostics: { wcagAuditor: { baseURL: `http://127.0.0.1:${busy}` } } }, flags: {} }), null, 'not managed');
    assert.equal(await resolveManagedServerPort({ profile: { ...live, diagnostics: { wcagAuditor: { baseURL: 'https://example.com', manageServer: true } } }, flags: {} }), null, 'never rewrites a remote URL');
  } finally {
    holder.close();
  }
});
