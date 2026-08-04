import {
  EXIT_CODES,
  runAccessibility,
  type AdapterRunner,
  type ToolkitConfig
} from 'portable-wcag-auditor';
import { getBuiltinAdapters } from 'portable-wcag-auditor/adapters';
import { renderJsonReport } from 'portable-wcag-auditor/reporters';

const customAdapter: AdapterRunner = async (_config, context) => ({
  surfaceCount: 1,
  findings: [{
    ruleId: 'custom/example',
    title: 'Example',
    outcome: 'passed',
    severity: 'advisory',
    target: { adapter: context.adapterName }
  }]
});

const config: ToolkitConfig = {
  schemaVersion: 1,
  project: { name: 'typed-consumer', root: '.' },
  adapters: [{ type: 'module', module: './adapter.mjs' }],
  reporters: [{ type: 'json', file: 'run.json' }]
};

const run = await runAccessibility(config, {
  quiet: true,
  adapters: { module: customAdapter }
});

renderJsonReport(run);
getBuiltinAdapters();
const passCode: 0 = EXIT_CODES.PASS;
void passCode;
