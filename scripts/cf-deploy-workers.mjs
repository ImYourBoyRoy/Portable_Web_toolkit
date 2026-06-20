#!/usr/bin/env node
// ./scripts/cf-deploy-workers.mjs — delegates to portable Web Toolkit
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Web_Toolkit', 'cloudflare-agent-toolkit', 'bin', 'cf-deploy-workers.mjs');
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
