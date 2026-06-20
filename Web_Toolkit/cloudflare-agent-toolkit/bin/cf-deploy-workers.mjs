#!/usr/bin/env node
// ./Web_Toolkit/cloudflare-agent-toolkit/bin/cf-deploy-workers.mjs
import { parseDeployFlags } from '../src/lib/deploy/context.mjs';
import { runDeployWorkers } from '../src/lib/deploy/workers.mjs';

process.exit(runDeployWorkers(parseDeployFlags(process.argv.slice(2))));
