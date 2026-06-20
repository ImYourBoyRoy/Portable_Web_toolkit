#!/usr/bin/env node
// ./Web_Toolkit/cloudflare-agent-toolkit/bin/cf-deploy-pages.mjs
import { parseDeployFlags } from '../src/lib/deploy/context.mjs';
import { runDeployPages } from '../src/lib/deploy/pages.mjs';

process.exit(runDeployPages(parseDeployFlags(process.argv.slice(2))));
