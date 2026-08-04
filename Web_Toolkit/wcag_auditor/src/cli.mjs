#!/usr/bin/env node
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { EXIT_CODES, TOOLKIT_NAME, TOOLKIT_VERSION } from './core/constants.mjs';
import { findConfig, loadConfig, writeStarterFiles } from './core/config.mjs';
import { findBuiltinRule, getBuiltinRules } from './core/rules.mjs';
import { runAccessibility } from './core/runner.mjs';

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const parsed = parseArguments(argv);
  try {
    switch (parsed.command) {
      case 'run':
        return await runCommand(parsed, io);
      case 'init':
        return await initCommand(parsed, io);
      case 'validate-config':
        return await validateConfigCommand(parsed, io);
      case 'list-rules':
        return listRulesCommand(io);
      case 'explain':
        return explainCommand(parsed, io);
      case 'version':
      case '--version':
      case '-v':
        io.stdout.write(`${TOOLKIT_VERSION}\n`);
        return EXIT_CODES.PASS;
      case 'help':
      case '--help':
      case '-h':
        io.stdout.write(helpText());
        return EXIT_CODES.PASS;
      default:
        io.stderr.write(`Unknown command: ${parsed.command}\n\n${helpText()}`);
        return EXIT_CODES.EXECUTION_ERROR;
    }
  } catch (error) {
    io.stderr.write(`[${error.code ?? 'ERROR'}] ${error.message}\n`);
    return EXIT_CODES.EXECUTION_ERROR;
  }
}

async function runCommand(parsed, io) {
  const cwd = path.resolve(parsed.options.cwd ?? process.cwd());
  const configPath = parsed.options.config
    ? path.resolve(cwd, parsed.options.config)
    : await findConfig(cwd);
  if (!configPath) throw new Error(`No wcag-auditor.config.mjs, wcag-auditor.config.js, or wcag-auditor.config.json found from ${cwd}`);
  const config = await loadConfig(configPath, { cwd });
  const run = await runAccessibility(config, {
    configIsNormalized: true,
    quiet: parsed.options.quiet,
    color: parsed.options.color,
    stream: io.stdout
  });
  return run.gate.exitCode;
}

async function initCommand(parsed, io) {
  const target = path.resolve(parsed.positionals[0] ?? parsed.options.cwd ?? process.cwd());
  const files = await writeStarterFiles(target, { force: parsed.options.force });
  io.stdout.write(`Created ${files.configPath}\nCreated ${files.evidencePath}\n`);
  return EXIT_CODES.PASS;
}

async function validateConfigCommand(parsed, io) {
  const cwd = path.resolve(parsed.options.cwd ?? process.cwd());
  const configPath = parsed.options.config
    ? path.resolve(cwd, parsed.options.config)
    : await findConfig(cwd);
  if (!configPath) throw new Error(`No accessibility configuration found from ${cwd}`);
  const config = await loadConfig(configPath, { cwd });
  io.stdout.write(`Valid configuration: ${config.configPath}\nProject: ${config.project.name}\nAdapters: ${config.adapters.length}\n`);
  return EXIT_CODES.PASS;
}

function listRulesCommand(io) {
  for (const rule of getBuiltinRules()) io.stdout.write(`${rule.id}\t${rule.title}\n`);
  return EXIT_CODES.PASS;
}

function explainCommand(parsed, io) {
  const ruleId = parsed.positionals[0];
  if (!ruleId) throw new Error('explain requires a rule ID');
  const rule = findBuiltinRule(ruleId);
  if (!rule) throw new Error(`Unknown built-in rule: ${ruleId}`);
  io.stdout.write(`${JSON.stringify(rule, null, 2)}\n`);
  return EXIT_CODES.PASS;
}

function parseArguments(argv) {
  const command = argv[0] ?? 'help';
  const options = { color: undefined };
  const positionals = [];
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--config' || argument === '--cwd') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else if (argument === '--quiet') {
      options.quiet = true;
    } else if (argument === '--force') {
      options.force = true;
    } else if (argument === '--no-color') {
      options.color = false;
    } else if (argument === '--color') {
      options.color = true;
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      positionals.push(argument);
    }
  }
  return { command, options, positionals };
}

function helpText() {
  return `${TOOLKIT_NAME} ${TOOLKIT_VERSION}\n\nUsage:\n  wcag-auditor init [directory] [--force]\n  wcag-auditor run [--config file] [--cwd directory] [--quiet] [--no-color]\n  wcag-auditor validate-config [--config file] [--cwd directory]\n  wcag-auditor list-rules\n  wcag-auditor explain <rule-id>\n  wcag-auditor version\n\nExit codes:\n  0  configured gate passed\n  1  blocking accessibility findings\n  2  configuration, dependency, execution, or empty-surface error\n  3  required evidence is untested or inconclusive\n`;
}

function defaultIo() {
  return { stdout: process.stdout, stderr: process.stderr };
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  }
})();
if (invokedDirectly) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
