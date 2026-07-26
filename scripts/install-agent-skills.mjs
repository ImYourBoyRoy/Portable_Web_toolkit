#!/usr/bin/env node
/**
 * Compatibility entrypoint retained for existing documentation and prompts.
 * It is deliberately read-only. Agent-driven installation is documented in
 * docs/agent-skills/INSTALL_PROTOCOL.md.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const raw = process.argv.slice(2).filter((value) => value !== '--');
const args = [];
for (let index = 0; index < raw.length; index += 1) {
  const token = raw[index];
  const normalized = token.toLowerCase();
  if (['-agent', '--agent'].includes(normalized)) {
    const agent = String(raw[index + 1] || '').toLowerCase();
    index += 1;
    if (agent && agent !== 'all') args.push('--agent', agent);
  } else if (['-scope', '--scope'].includes(normalized)) {
    args.push('--scope', String(raw[index + 1] || '').toLowerCase());
    index += 1;
  } else {
    args.push(token);
  }
}

console.error(
  '[install-agent-skills] Automated replacement is retired; reporting status only.',
);
const result = spawnSync(
  process.execPath,
  [path.join(scriptsDir, 'check-agent-skills.mjs'), ...args],
  { stdio: 'inherit', shell: false },
);
process.exit(result.status ?? 1);
