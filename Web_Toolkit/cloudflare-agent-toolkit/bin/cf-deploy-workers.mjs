#!/usr/bin/env node
// ./Web_Toolkit/cloudflare-agent-toolkit/bin/cf-deploy-workers.mjs
import { resolvePortableRoot } from '../../shared/lib/context.mjs';
import { parseDeployFlags } from '../src/lib/deploy/context.mjs';
import { runDeployWorkers } from '../src/lib/deploy/workers.mjs';

resolvePortableRoot(import.meta.url, 2);
process.exit(runDeployWorkers(parseDeployFlags(process.argv.slice(2))));
