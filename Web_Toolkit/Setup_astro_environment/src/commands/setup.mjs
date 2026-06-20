// ./Web_Toolkit/Setup_astro_environment/src/commands/setup.mjs
/**
 * Core doctor/fix/verify workflows for Astro/Vite/Cloudflare project setup.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { commandAvailable, runCommand } from '../lib/exec.mjs';
import { prettyJson, printCheck, printSection, toBool } from '../lib/format.mjs';
import { loadProfileContext } from '../lib/profile.mjs';
import { buildProjectEnvExample } from '../../../shared/lib/project-bootstrap.mjs';

function detectPackageManager(projectRoot) {
  if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function packageManagerInstallCommand(packageManager) {
  if (packageManager === 'pnpm') return ['pnpm', ['install']];
  if (packageManager === 'yarn') return ['yarn', ['install']];
  return ['npm', ['install']];
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findAstroConfig(projectRoot) {
  const matches = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.cjs']
    .map((name) => path.join(projectRoot, name))
    .filter((filePath) => fs.existsSync(filePath));
  return matches[0] || '';
}

function commandScriptExists(packageJson, scriptName) {
  return Boolean(packageJson?.scripts && typeof packageJson.scripts[scriptName] === 'string' && packageJson.scripts[scriptName].trim());
}

function shouldScaffoldEnvExample(filePath) {
  if (!fs.existsSync(filePath)) return true;
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return true;
  const meaningfulLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  return meaningfulLines.length === 0;
}

export function collectChecks(flags = {}) {
  const profileContext = loadProfileContext(flags);
  const projectRoot = profileContext.projectRoot;
  const profilePath = profileContext.profilePath;
  const profile = profileContext.profile;
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = readJsonIfExists(packageJsonPath);
  const packageManager = detectPackageManager(projectRoot);
  const astroConfigPath = findAstroConfig(projectRoot);
  const wranglerConfigPath = path.join(projectRoot, 'wrangler.toml');
  const envExamplePath = path.join(projectRoot, '.env.example');
  const nodeModulesPath = path.join(projectRoot, 'node_modules');

  return {
    projectRoot,
    profilePath,
    profile,
    packageManager,
    packageJsonPath,
    packageJsonExists: Boolean(packageJson),
    packageJson,
    astroConfigPath,
    wranglerConfigPath,
    envExamplePath,
    nodeModulesPath,
    nodeAvailable: commandAvailable('node'),
    npmAvailable: commandAvailable('npm'),
    npxAvailable: commandAvailable('npx'),
    wranglerAvailable: commandAvailable('wrangler'),
    packageManagerAvailable: commandAvailable(packageManager),
    nodeModulesExists: fs.existsSync(nodeModulesPath),
    astroConfigExists: Boolean(astroConfigPath),
    wranglerConfigExists: fs.existsSync(wranglerConfigPath),
    envExampleExists: fs.existsSync(envExamplePath),
    hasCheckScript: commandScriptExists(packageJson, 'check'),
    hasBuildScript: commandScriptExists(packageJson, 'build'),
    hasAstroDependency: Boolean(packageJson?.dependencies?.astro || packageJson?.devDependencies?.astro),
    hasTypeScriptDependency: Boolean(packageJson?.dependencies?.typescript || packageJson?.devDependencies?.typescript),
    hasWranglerDependency: Boolean(packageJson?.dependencies?.wrangler || packageJson?.devDependencies?.wrangler),
    hasCloudflareAdapter: Boolean(packageJson?.dependencies?.['@astrojs/cloudflare'] || packageJson?.devDependencies?.['@astrojs/cloudflare'])
  };
}

export function previewCommand(report) {
  const configuredPreview = String(report.profile?.commands?.preview || '').trim();
  const packagePreview = String(report.packageJson?.scripts?.preview || '').trim();
  const previewSources = [configuredPreview, packagePreview].filter(Boolean).join(' ');
  if (report.hasCloudflareAdapter && /\bastro\s+preview\b/i.test(previewSources) && commandScriptExists(report.packageJson, 'dev')) {
    return 'npm run dev';
  }
  if (configuredPreview) return configuredPreview;
  if (commandScriptExists(report.packageJson, 'preview')) return 'npm run preview';
  if (commandScriptExists(report.packageJson, 'dev')) return 'npm run dev';
  return '';
}

function printDoctorReport(report) {
  printSection('Astro environment doctor');
  printCheck('Project root', 'pass', report.projectRoot);
  printCheck('Site profile', report.profilePath ? 'pass' : 'warn', report.profilePath || 'not linked');
  printCheck('Node available', report.nodeAvailable ? 'pass' : 'fail');
  printCheck('npm available', report.npmAvailable ? 'pass' : 'fail');
  printCheck('npx available', report.npxAvailable ? 'pass' : 'fail');
  printCheck('Package manager', report.packageManagerAvailable ? 'pass' : 'fail', report.packageManager);
  printCheck('package.json', report.packageJsonExists ? 'pass' : 'fail');
  printCheck('node_modules', report.nodeModulesExists ? 'pass' : 'warn', report.nodeModulesExists ? 'installed' : 'missing');
  printCheck('Astro config', report.astroConfigExists ? 'pass' : 'fail', report.astroConfigPath || 'missing');
  printCheck('Wrangler config', report.wranglerConfigExists ? 'pass' : 'warn', report.wranglerConfigExists ? report.wranglerConfigPath : 'missing');
  printCheck('.env.example', report.envExampleExists ? 'pass' : 'warn', report.envExamplePath);
  printCheck('check script', report.hasCheckScript ? 'pass' : 'warn');
  printCheck('build script', report.hasBuildScript ? 'pass' : 'fail');
  printCheck('astro dependency', report.hasAstroDependency ? 'pass' : 'fail');
  printCheck('typescript dependency', report.hasTypeScriptDependency ? 'pass' : 'warn');
  printCheck('wrangler dependency', report.hasWranglerDependency ? 'pass' : 'warn');
  printCheck('Cloudflare adapter', report.hasCloudflareAdapter ? 'pass' : 'warn');
}

export async function runDoctor(flags = {}) {
  const report = collectChecks(flags);
  if (toBool(flags.json, false)) {
    process.stdout.write(prettyJson(report));
  } else {
    printDoctorReport(report);
  }

  const hasHardFailure = !report.nodeAvailable ||
    !report.npmAvailable ||
    !report.packageJsonExists ||
    !report.astroConfigExists ||
    !report.hasBuildScript ||
    !report.hasAstroDependency;

  return hasHardFailure ? 2 : 0;
}

export async function runFix(flags = {}) {
  const report = collectChecks(flags);
  printDoctorReport(report);
  const fixes = [];

  if (!report.packageJsonExists) {
    throw new Error(`No package.json found at ${report.packageJsonPath}`);
  }

  if (shouldScaffoldEnvExample(report.envExamplePath)) {
    fs.writeFileSync(report.envExamplePath, buildProjectEnvExample({ projectRoot: report.projectRoot, profile: report.profile }), 'utf8');
    fixes.push(`${report.envExampleExists ? 'Refreshed' : 'Created'} ${report.envExamplePath}`);
  }

  if (!report.nodeModulesExists && !toBool(flags['skip-install'], false)) {
    const [command, args] = packageManagerInstallCommand(report.packageManager);
    runCommand(command, args, { cwd: report.projectRoot, stdio: 'inherit' });
    fixes.push(`Installed dependencies with ${command} ${args.join(' ')}`);
  }

  printSection('Fix results');
  if (fixes.length === 0) {
    printCheck('Safe fixes', 'pass', 'No changes were needed');
  } else {
    for (const fix of fixes) {
      printCheck('Applied', 'fix', fix);
    }
  }

  return 0;
}

export async function runVerify(flags = {}) {
  const report = collectChecks(flags);
  printDoctorReport(report);
  const commands = [];

  if (report.profile?.commands?.check) {
    commands.push(report.profile.commands.check);
  } else if (report.hasCheckScript) {
    commands.push('npm run check');
  }

  if (report.profile?.commands?.build) {
    commands.push(report.profile.commands.build);
  } else if (report.hasBuildScript) {
    commands.push('npm run build');
  }

  if (!toBool(flags['skip-tests'], false)) {
    for (const entry of report.profile?.commands?.tests || []) {
      commands.push(entry);
    }
  }

  printSection('Verification commands');
  for (const entry of commands) {
    printCheck('Run', 'pass', entry);
    if (process.platform === 'win32') {
      runCommand('cmd', ['/d', '/s', '/c', entry], { cwd: report.projectRoot, stdio: 'inherit' });
    } else {
      runCommand('sh', ['-lc', entry], { cwd: report.projectRoot, stdio: 'inherit' });
    }
  }

  return 0;
}

export async function runPrepareProject(flags = {}) {
  const fixCode = await runFix(flags);
  if (fixCode !== 0) return fixCode;
  return runVerify(flags);
}

export async function runPreview(flags = {}) {
  const report = collectChecks(flags);
  printDoctorReport(report);
  const command = String(flags.command || previewCommand(report)).trim();
  if (!command) {
    throw new Error('No preview command found. Add commands.preview to the site profile or a preview/dev script to package.json.');
  }

  printSection('Preview launch');
  printCheck('Command', 'pass', command);
  printCheck('Project root', 'pass', report.projectRoot);
  printCheck('Note', 'warn', 'Use Ctrl+C to stop the local preview server after browsing.');

  if (process.platform === 'win32') {
    runCommand('cmd', ['/d', '/s', '/c', command], { cwd: report.projectRoot, stdio: 'inherit' });
  } else {
    runCommand('sh', ['-lc', command], { cwd: report.projectRoot, stdio: 'inherit' });
  }
  return 0;
}


