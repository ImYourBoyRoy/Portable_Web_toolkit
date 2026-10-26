#!/usr/bin/env node
// ./Web_Toolkit/cloudflare-agent-toolkit/bin/cf-deploy-pages.mjs
import { resolvePortableRoot } from '../../shared/lib/context.mjs';
import { parseDeployFlags } from '../src/lib/deploy/context.mjs';
import { runDeployPages } from '../src/lib/deploy/pages.mjs';

resolvePortableRoot(import.meta.url, 2);
process.exit(runDeployPages(parseDeployFlags(process.argv.slice(2))));
