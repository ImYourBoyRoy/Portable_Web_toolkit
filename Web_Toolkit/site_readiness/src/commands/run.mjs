// ./Web_Toolkit/site_readiness/src/commands/run.mjs
/**
 * Run phased site readiness collection with sandbox-aware skips and optional safe auto-fixes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadSiteProfileContext } from '../../../shared/lib/context.mjs';
import { probeCapabilities } from '../lib/capabilities.mjs';
import {
  PORTABLE_ROOT,
  parseJsonStdout,
  runToolkitScript,
  statusFromExitCode,
} from '../lib/exec.mjs';
import {
  buildNextSteps,
  buildRecommendedFixes,
  renderConsoleSummary,
  renderMarkdown,
} from '../lib/report.mjs';

function boolFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function findAstroConfig(projectRoot) {
  return ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.cjs']
    .map((name) => path.join(projectRoot, name))
    .find((candidate) => fs.existsSync(candidate)) || '';
}

function discoverProfilePath(projectRoot) {
  try {
    const matches = fs.readdirSync(projectRoot)
      .filter((name) => name.endsWith('.site-profile.json'))
      .map((name) => path.join(projectRoot, name));
    return matches.length === 1 ? matches[0] : '';
  } catch {
    return '';
  }
}

function skippedStep(id, reason) {
  return { id, status: 'skipped', reason, issues: [] };
}

function stepResult(id, status, issues = [], extra = {}) {
  return { id, status, issues, ...extra };
}

function checkProjectFiles(projectRoot) {
  const issues = [];
  const toolkitLinked = fs.existsSync(
    path.join(projectRoot, 'Web_Toolkit', 'headers_deploy', 'bin', 'headers-deploy.mjs'),
  );
  const checks = {
    readme: fs.existsSync(path.join(projectRoot, 'README.md')),
    memory: fs.existsSync(path.join(projectRoot, 'MEMORY.md')),
    gitignore: fs.existsSync(path.join(projectRoot, '.gitignore')),
    envExample: fs.existsSync(path.join(projectRoot, '.env.example')),
    packageJson: fs.existsSync(path.join(projectRoot, 'package.json')),
    astroConfig: Boolean(findAstroConfig(projectRoot)),
    wrangler: fs.existsSync(path.join(projectRoot, 'wrangler.toml')),
    webToolkitLinked: toolkitLinked,
    agentSkillsLinked: fs.existsSync(path.join(projectRoot, '.agents', 'skills')),
  };

  if (!checks.readme) issues.push('Add README.md with project synopsis and run instructions.');
  if (!checks.memory) issues.push('Add MEMORY.md for session-to-session agent continuity.');
  if (!checks.gitignore) issues.push('Add .gitignore before committing builds, .env, or caches.');
  if (!checks.envExample) issues.push('Add .env.example documenting required keys (no secrets).');
  if (!checks.packageJson) issues.push('Copy site-starter/workers.package.json or pages.package.json → package.json.');
  if (!checks.astroConfig) issues.push('Add astro.config.* before build/deploy workflows.');
  if (!checks.wrangler) issues.push('Copy site-starter workers.wrangler.toml or pages.wrangler.toml → wrangler.toml.');
  if (!checks.webToolkitLinked) {
    issues.push('Link Web_Toolkit at project root (link-web-toolkit.mjs). npm scripts call toolkit CLIs directly.');
  }
  if (!checks.agentSkillsLinked) {
    issues.push('Link required agent skills into .agents/skills/ (manage-project-skills.mjs link).');
  }

  const status = issues.length === 0 ? 'pass' : issues.length <= 2 ? 'warn' : 'fail';
  return stepResult('project-files', status, issues, { checks });
}

function checkSiteProfile(profilePath, profile) {
  if (!profilePath || !profile) {
    return stepResult('site-profile', 'fail', ['Create or link a *.site-profile.json (init-site-profile).']);
  }

  const issues = [];
  const deployTarget = String(profile.deployTarget || '').toLowerCase();
  if (!['workers', 'pages'].includes(deployTarget)) {
    issues.push('Set deployTarget to workers or pages in the site profile.');
  }
  if (!profile.commands?.deploy?.production) {
    issues.push('Define commands.deploy.production in the site profile.');
  }
  if (deployTarget === 'workers' && !profile.cloudflare?.workerNames?.production) {
    issues.push('Set cloudflare.workerNames.production for Workers deploys.');
  }
  if (deployTarget === 'pages' && !profile.cloudflare?.pagesProject) {
    issues.push('Set cloudflare.pagesProject for Pages deploys.');
  }

  const status = issues.length === 0 ? 'pass' : 'warn';
  return stepResult('site-profile', status, issues, { deployTarget });
}

function checkToolkitLink(capabilities) {
  if (capabilities.toolkitLinked) {
    return stepResult('toolkit-link', 'pass', []);
  }
  return stepResult('toolkit-link', 'fail', [
    'Link Web_Toolkit (junction/symlink) or set WEB_TOOLKIT_ROOT before using toolkit scripts.',
  ]);
}

function checkSkillArchitecture(projectRoot) {
  const issues = [];
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const agentSkillsPath = path.join(projectRoot, '.agents', 'skills');
  const internalSkillsLinked = fs.existsSync(agentSkillsPath);

  if (!internalSkillsLinked) {
    issues.push('Internal project skills missing in .agents/skills/. Run manage-project-skills.mjs link --project . --skills portable-web-toolkit,site-readiness,site-starter,toolkit-update');
  }

  const globalRouterCandidates = [
    path.join(home, '.gemini', 'config', 'skills', 'portable-web-toolkit-router'),
    path.join(home, '.cursor', 'skills', 'portable-web-toolkit-router'),
    path.join(home, '.claude', 'skills', 'portable-web-toolkit-router'),
  ];
  const globalRouterPresent = globalRouterCandidates.some((p) => fs.existsSync(p));
  if (!globalRouterPresent) {
    issues.push('Global router skill missing. Copy skills/portable-web-toolkit-router to ~/.gemini/config/skills/ or ~/.cursor/skills/.');
  }

  const legacyGlobalNames = ['portable-web-toolkit', 'instagram-clone', 'vectorize-pipeline'];
  const legacyGlobalFound = [];
  for (const name of legacyGlobalNames) {
    const legacyCandidates = [
      path.join(home, '.gemini', 'config', 'skills', name),
      path.join(home, '.cursor', 'skills', name),
      path.join(home, '.claude', 'skills', name),
    ];
    if (legacyCandidates.some((p) => fs.existsSync(p))) {
      legacyGlobalFound.push(name);
    }
  }
  if (legacyGlobalFound.length > 0) {
    issues.push(`Legacy global skills detected in home config (${legacyGlobalFound.join(', ')}). Purge global copies to prevent context bloat.`);
  }

  const checks = {
    internalSkillsLinked,
    globalRouterPresent,
    legacyGlobalSkillsClean: legacyGlobalFound.length === 0,
  };

  const status = issues.length === 0 ? 'pass' : internalSkillsLinked ? 'warn' : 'fail';
  return stepResult('skill-architecture', status, issues, { checks });
}

async function runAutoFixes({ projectRoot, profilePath, flags, toolkitRoot }) {
  const autoFixes = [];
  if (!boolFlag(flags['apply-safe-fixes'], false)) return autoFixes;

  const initArgs = ['apply-safe', '--project-root', projectRoot];
  if (profilePath) initArgs.push('--site-profile', profilePath);
  if (boolFlag(flags['install-deps'], false)) initArgs.push('--install-deps');

  const initResult = runToolkitScript(
    'project_init/bin/project-init.mjs',
    initArgs,
    { toolkitRoot, cwd: projectRoot },
  );
  if (initResult.status === 0) {
    autoFixes.push('project-init apply-safe (missing starter files only)');
  } else {
    autoFixes.push(`project-init apply-safe failed (exit ${initResult.status})`);
  }

  return autoFixes;
}

export async function runSiteReadiness(flags = {}) {
  let projectRoot;
  let profilePath;
  let profile;
  let toolkitRoot = PORTABLE_ROOT;

  try {
    if (flags['site-profile']) {
      const context = loadSiteProfileContext({
        portableRoot: PORTABLE_ROOT,
        flags,
        requireProfile: false,
        validateProfile: false,
      });
      projectRoot = context.projectRoot;
      profilePath = context.profilePath;
      profile = context.profile;
    } else {
      projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
      profilePath = discoverProfilePath(projectRoot);
      profile = profilePath ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : null;
    }
  } catch (error) {
    projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
    profilePath = discoverProfilePath(projectRoot);
    profile = profilePath && fs.existsSync(profilePath)
      ? JSON.parse(fs.readFileSync(profilePath, 'utf8'))
      : null;
  }

  const deployTarget = String(profile?.deployTarget || '').toLowerCase();
  const capabilities = await probeCapabilities({ projectRoot, deployTarget, profile });
  if (capabilities.toolkitRoot) toolkitRoot = capabilities.toolkitRoot;

  const autoFixes = await runAutoFixes({ projectRoot, profilePath, flags, toolkitRoot });
  const steps = [];

  steps.push(stepResult('capabilities', 'pass', [], {
    metrics: {
      mode: capabilities.mode,
      network: capabilities.network,
      cloudflareAuth: capabilities.cloudflareAuth,
    },
  }));

  steps.push(checkToolkitLink(capabilities));
  steps.push(checkProjectFiles(projectRoot));
  steps.push(checkSiteProfile(profilePath, profile));
  steps.push(checkSkillArchitecture(projectRoot));

  if (!capabilities.toolkitLinked) {
    steps.push(skippedStep('astro-env', 'Web_Toolkit not linked'));
    steps.push(skippedStep('stylesheet-check', 'Web_Toolkit not linked'));
    steps.push(skippedStep('discovery', 'Web_Toolkit not linked'));
    steps.push(skippedStep('instagram', 'Web_Toolkit not linked'));
    steps.push(skippedStep('integration', 'Web_Toolkit not linked'));
    steps.push(skippedStep('build', 'Web_Toolkit not linked'));
  } else {
    if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
      steps.push(skippedStep('astro-env', 'package.json missing'));
    } else {
      const astroArgs = ['doctor', '--project-root', projectRoot, '--json'];
      if (profilePath) astroArgs.push('--site-profile', profilePath);
      const astroResult = runToolkitScript(
        'Setup_astro_environment/bin/astro-env-setup.mjs',
        astroArgs,
        { toolkitRoot, cwd: projectRoot },
      );
      const astroJson = parseJsonStdout(astroResult);
      const issues = [];
      if (astroJson) {
        if (!astroJson.nodeModulesExists) issues.push('Run npm install — node_modules is missing.');
        if (!astroJson.astroConfigExists) issues.push('Add astro.config.*.');
        if (!astroJson.hasBuildScript) issues.push('Add npm run build script to package.json.');
        if (!astroJson.hasAstroDependency) issues.push('Add astro to package.json dependencies.');
      } else {
        if (!capabilities.nodeModules) issues.push('Run npm install — node_modules is missing.');
        if (!findAstroConfig(projectRoot)) issues.push('Add astro.config.*.');
        const pkg = fs.existsSync(path.join(projectRoot, 'package.json'))
          ? JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
          : null;
        if (!pkg?.scripts?.build) issues.push('Add npm run build script to package.json.');
      }
      const astroStatus = astroResult.status === 2 ? 'warn' : statusFromExitCode(astroResult.status);
      steps.push(stepResult('astro-env', issues.length ? astroStatus : 'pass', issues, { report: astroJson }));
    }

    if (!fs.existsSync(path.join(projectRoot, 'src'))) {
      steps.push(skippedStep('stylesheet-check', 'src/ not present yet'));
    } else {
      const styleResult = runToolkitScript(
        'stylesheet_check/bin/stylesheet-check.mjs',
        ['scan', '--root', projectRoot],
        { toolkitRoot, cwd: projectRoot },
      );
      const issues = styleResult.status === 0 ? [] : ['Stylesheet policy violations — run styles:check for details.'];
      steps.push(stepResult('stylesheet-check', statusFromExitCode(styleResult.status), issues));
    }

    if (boolFlag(flags.build, false)) {
      if (!capabilities.nodeModules) {
        steps.push(skippedStep('build', 'node_modules missing'));
      } else {
        const realBuild = spawnSync('npm', ['run', 'build'], {
          cwd: projectRoot,
          encoding: 'utf8',
          shell: true,
          stdio: 'pipe',
        });
        const issues = realBuild.status === 0 ? [] : ['npm run build failed — fix compile errors before deploy.'];
        steps.push(stepResult('build', statusFromExitCode(realBuild.status ?? 1), issues));
        if (realBuild.status === 0) {
          capabilities.distBuilt = true;
          capabilities.distPath = capabilities.distPath || path.join(projectRoot, 'dist');
        }
      }
    } else {
      steps.push(skippedStep('build', 'not requested (pass --build to include)'));
    }

    if (!capabilities.distBuilt) {
      steps.push(skippedStep('discovery', 'dist/ missing — run npm run build first'));
    } else {
      const discoveryResult = runToolkitScript(
        'discovery_doctor/bin/discovery-doctor.mjs',
        [capabilities.distPath],
        { toolkitRoot, cwd: projectRoot },
      );
      const issues = discoveryResult.status === 0 ? [] : ['Discovery doctor failed — regenerate robots/sitemap/llms layer.'];
      steps.push(stepResult('discovery', statusFromExitCode(discoveryResult.status), issues));
    }

    if (!capabilities.feedJson) {
      steps.push(skippedStep('instagram', 'no src/data/instagram/feed.json'));
    } else {
      const igResult = runToolkitScript(
        'instagram_clone/bin/instagram-clone.mjs',
        ['audit', '--project-root', projectRoot],
        { toolkitRoot, cwd: projectRoot },
      );
      const issues = igResult.status === 0 ? [] : ['Instagram clone audit failed — re-run ig:clone.'];
      steps.push(stepResult('instagram', statusFromExitCode(igResult.status), issues));
    }

    if (boolFlag(flags['skip-network'], false) || !capabilities.network) {
      steps.push(skippedStep('integration', 'network unavailable or --skip-network'));
    } else if (!profilePath) {
      steps.push(skippedStep('integration', 'site profile required'));
    } else if (!capabilities.cloudflareAuth) {
      steps.push(skippedStep('integration', 'CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing in .env'));
    } else {
      const integrationArgs = ['run', '--project-root', projectRoot, '--site-profile', profilePath];
      const integrationResult = runToolkitScript(
        'integration_doctor/bin/integration-doctor.mjs',
        integrationArgs,
        { toolkitRoot, cwd: projectRoot },
      );
      const issues = integrationResult.status === 0 ? [] : ['Integration doctor reported env/API issues.'];
      steps.push(stepResult('integration', statusFromExitCode(integrationResult.status), issues));
    }
  }

  const recommendedFixes = buildRecommendedFixes({ steps, capabilities, flags });
  const nextSteps = buildNextSteps({ steps, capabilities, recommendedFixes });

  const report = {
    generatedAt: new Date().toISOString(),
    projectRoot,
    profilePath,
    capabilities,
    steps,
    autoFixes,
    recommendedFixes,
    nextSteps,
  };

  const outputDir = path.join(projectRoot, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `site-readiness-${stamp}.json`);
  const markdownPath = path.join(outputDir, `site-readiness-${stamp}.md`);
  report.jsonPath = jsonPath;
  report.markdownPath = markdownPath;

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(report), 'utf8');

  console.log(renderConsoleSummary(report));

  const hardFails = steps.filter((step) => step.status === 'fail').length;
  const warns = steps.filter((step) => step.status === 'warn').length;
  if (hardFails > 0) return 1;
  if (warns > 0) return 2;
  return 0;
}
