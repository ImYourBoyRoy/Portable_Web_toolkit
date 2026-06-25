// ./Web_Toolkit/site_readiness/src/lib/report.mjs
/**
 * Aggregate readiness findings into next steps and human/agent reports.
 */

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export function buildRecommendedFixes({ steps = [], capabilities = {}, flags = {} } = {}) {
  const fixes = [];
  const stepMap = Object.fromEntries(steps.map((step) => [step.id, step]));

  if (!capabilities.toolkitLinked) {
    fixes.push({
      id: 'link-toolkit',
      command: 'cmd /c mklink /J Web_Toolkit ..\\Portable_Web_toolkit\\Web_Toolkit',
      description: 'Link the portable toolkit into the project root.',
      auto: false,
    });
  }

  if (stepMap['project-files']?.issues?.length) {
    fixes.push({
      id: 'apply-safe',
      command: 'node ./Web_Toolkit/project_init/bin/project-init.mjs apply-safe --project-root .',
      description: 'Create missing README, MEMORY, .gitignore, and .env.example without overwriting existing files.',
      auto: true,
    });
  }

  if (!capabilities.nodeModules && stepMap['astro-env']?.status !== 'pass') {
    fixes.push({
      id: 'install-deps',
      command: 'npm install',
      description: 'Install dependencies before build or Astro doctor checks.',
      auto: Boolean(flags['install-deps']),
    });
  }

  if (capabilities.nodeModules && stepMap['build']?.status === 'fail') {
    fixes.push({
      id: 'build',
      command: 'npm run build',
      description: 'Fix build errors surfaced by the readiness build check.',
      auto: false,
    });
  }

  if (capabilities.distBuilt && stepMap['discovery']?.status === 'fail') {
    fixes.push({
      id: 'discovery',
      command: `node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ${capabilities.distPath || './dist'}`,
      description: 'Resolve discovery layer gaps (robots, sitemap, llms, JSON-LD).',
      auto: false,
    });
  }

  if (capabilities.feedJson && stepMap['instagram']?.status === 'fail') {
    fixes.push({
      id: 'instagram-clone',
      command: 'node ./Web_Toolkit/instagram_clone/bin/instagram-clone.mjs clone --project-root .',
      description: 'Refresh Instagram feed JSON and local media.',
      auto: false,
    });
  }

  if (capabilities.network && capabilities.cloudflareAuth && stepMap['integration']?.status === 'fail') {
    fixes.push({
      id: 'integration',
      command: 'node ./Web_Toolkit/integration_doctor/bin/integration-doctor.mjs run --project-root . --site-profile <profile>',
      description: 'Fix live integration/env issues before deploy.',
      auto: false,
    });
  }

  if (capabilities.mode !== 'sandbox' && stepMap['site-profile']?.status !== 'pass') {
    fixes.push({
      id: 'site-profile',
      command: 'node ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs',
      description: 'Create or complete the site profile for deploy and diagnostics.',
      auto: false,
    });
  }

  return fixes;
}

export function buildNextSteps({ steps = [], capabilities = {}, recommendedFixes = [] } = {}) {
  const next = [];

  for (const step of steps) {
    if (step.status === 'skipped') {
      next.push(`[skipped:${step.id}] ${step.reason}`);
      continue;
    }
    for (const issue of step.issues || []) {
      next.push(issue);
    }
  }

  for (const fix of recommendedFixes.filter((entry) => !entry.auto)) {
    next.push(`${fix.description} → \`${fix.command}\``);
  }

  if (capabilities.mode === 'sandbox') {
    next.push('Sandbox/local-only mode: live Cloudflare, integration, and production smoke checks were limited or skipped.');
  }

  return unique(next);
}

export function renderConsoleSummary(report) {
  const lines = [
    '',
    '[site-readiness] Summary',
    `  Mode: ${report.capabilities.mode}${report.capabilities.sandboxHints.length ? ` (${report.capabilities.sandboxHints.join('; ')})` : ''}`,
    `  Project: ${report.projectRoot}`,
    `  Profile: ${report.profilePath || '(none)'}`,
    `  Toolkit: ${report.capabilities.toolkitLinked ? report.capabilities.toolkitRoot : 'not linked'}`,
    '',
    '  Steps:',
  ];

  for (const step of report.steps) {
    const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skipped: 'SKIP' }[step.status] || step.status;
    lines.push(`    - ${step.id}: ${icon}${step.reason ? ` — ${step.reason}` : ''}`);
    for (const issue of (step.issues || []).slice(0, 3)) {
      lines.push(`        • ${issue}`);
    }
  }

  if (report.autoFixes?.length) {
    lines.push('', '  Auto-fixes applied:');
    for (const fix of report.autoFixes) lines.push(`    - ${fix}`);
  }

  if (report.nextSteps?.length) {
    lines.push('', '  Next:');
    for (const step of report.nextSteps.slice(0, 8)) lines.push(`    - ${step}`);
    if (report.nextSteps.length > 8) {
      lines.push(`    - …and ${report.nextSteps.length - 8} more (see report JSON)`);
    }
  }

  lines.push('', `  JSON: ${report.jsonPath}`);
  lines.push(`  Markdown: ${report.markdownPath}`);
  return lines.join('\n');
}

export function renderMarkdown(report) {
  const lines = [
    '# Site Readiness Report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Environment mode: **${report.capabilities.mode}**`,
    `- Project root: \`${report.projectRoot}\``,
    `- Site profile: ${report.profilePath ? `\`${report.profilePath}\`` : '_not linked_'}`,
    `- Toolkit: ${report.capabilities.toolkitLinked ? `\`${report.capabilities.toolkitRoot}\`` : '_not linked_'}`,
    '',
    '## Capabilities',
    '',
    `- Network: ${report.capabilities.network}`,
    `- Cloudflare auth in .env: ${report.capabilities.cloudflareAuth}`,
    `- node_modules: ${report.capabilities.nodeModules}`,
    `- dist build: ${report.capabilities.distBuilt ? report.capabilities.distPath : 'missing'}`,
    `- Instagram feed.json: ${report.capabilities.feedJson}`,
    '',
    '## Step results',
    '',
  ];

  for (const step of report.steps) {
    lines.push(`### ${step.id} — ${step.status}`);
    if (step.reason) lines.push(`_${step.reason}_`);
    if (step.issues?.length) {
      for (const issue of step.issues) lines.push(`- ${issue}`);
    } else {
      lines.push('- No issues recorded.');
    }
    lines.push('');
  }

  if (report.autoFixes?.length) {
    lines.push('## Auto-fixes applied', '');
    for (const fix of report.autoFixes) lines.push(`- ${fix}`);
    lines.push('');
  }

  lines.push('## Recommended fixes', '');
  if (!report.recommendedFixes?.length) {
    lines.push('- None suggested.');
  } else {
    for (const fix of report.recommendedFixes) {
      lines.push(`- **${fix.id}**: ${fix.description}`);
      lines.push(`  \`${fix.command}\``);
    }
  }

  lines.push('', '## Next steps', '');
  if (!report.nextSteps?.length) {
    lines.push('- No obvious blockers. Proceed with build, discovery, and deploy gates.');
  } else {
    for (const step of report.nextSteps) lines.push(`- ${step}`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}
