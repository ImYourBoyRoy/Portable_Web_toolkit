#!/usr/bin/env node
// ./Web_Toolkit/dev_ports/bin/dev-ports.mjs
/**
 * CLI entrypoint for dev-ports: pick a free local port, see who holds one, and stop only servers the toolkit started.
 */

import { parseCliArgs } from '../../shared/lib/cli.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { cleanupOwned, findFreePort, listOwned, listenerInfo, releasePort } from '../../shared/lib/dev-server.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'dev-ports',
    summary: 'Pick a free local port, see who holds a port, and stop only the servers the toolkit started. Never assume 4321 is free: it is often the user\'s own dev server.',
    usage: [
      'dev-ports free [--preferred 4321] [--json]',
      'dev-ports who --port <n> [--json]',
      'dev-ports list [--json]',
      'dev-ports release --port <n> [--approved-pid <listener pid>] [--json]',
      'dev-ports cleanup [--all] [--json]'
    ],
    commands: [
      { name: 'free', description: 'Print a free port (the preferred one when free, otherwise one chosen by the OS) and whether the preferred port was busy.' },
      { name: 'who', description: 'Show the process listening on a port (pid, command, working directory) and whether the toolkit started it.' },
      { name: 'list', description: 'Servers the toolkit started and still owns (from .runtime/owned-processes.json; dead or recycled pids are dropped).' },
      { name: 'release', description: 'Free a port. A server the toolkit started is stopped. Anyone else\'s process is NOT touched: the result says who owns it so you can ask the user.' },
      { name: 'cleanup', description: 'Stop owned servers whose starting run is gone (crashed or killed runs); --all stops every owned server.' }
    ],
    flags: [
      { name: '--port <n>', description: 'The port to inspect or release.' },
      { name: '--preferred <n>', description: 'free: the port you would like (for example a framework default).' },
      { name: '--approved-pid <n>', description: 'release: the pid the USER approved stopping in chat, which must equal the current listener pid. Never pass it without asking the user first.' },
      { name: '--all', description: 'cleanup: stop every owned server, not only orphans.' },
      { name: '--json', description: 'Structured output.' }
    ],
    examples: [
      'dev-ports free --preferred 4321',
      'dev-ports who --port 4321',
      'dev-ports release --port 53211',
      'dev-ports cleanup'
    ],
    notes: [
      'Ownership: only servers started through the toolkit (preview, probes, audits) are registered. They are safe to stop yourself, during tests and when finished.',
      'A foreign listener (the user\'s dev server, another project) is never stopped without the user\'s explicit yes for that exact pid. Show them the pid, command and directory, then use --approved-pid.',
      'The approval flag is a convention for agents, not a security boundary.'
    ],
    exitCodes: [
      { name: '0', description: 'Completed (free port found, port released or already free).' },
      { name: '2', description: 'release: the port is held by a process the toolkit does not own and no matching approval was given.' },
      { name: '1', description: 'Bad arguments or unhandled failure.' }
    ]
  });
}

const out = (json, data, text) => process.stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : `${text}\n`);

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  const json = flags.json === true;
  if (['help', '--help', '-h'].includes(primary) || flags.help) { printHelp(); return 0; }
  const port = flags.port === undefined ? null : Number(flags.port);
  if (flags.port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) throw new Error('--port must be a number between 1 and 65535');

  if (primary === 'free') {
    const preferred = flags.preferred === undefined ? undefined : Number(flags.preferred);
    const found = await findFreePort({ preferred });
    out(json, found, found.busy ? `${found.port} (preferred ${found.preferred} is in use by something else; it was not touched)` : String(found.port));
    return 0;
  }
  if (primary === 'who') {
    if (!port) throw new Error('who needs --port <n>');
    const listener = listenerInfo(port);
    const owned = listener ? listOwned().some((entry) => entry.pid === listener.pid) : false;
    out(json, { port, listener, owned }, listener
      ? `port ${port}: pid ${listener.pid} ${listener.command || ''}${listener.cwd ? `\n  cwd ${listener.cwd}` : ''}\n  ${owned ? 'started by the toolkit (safe to stop)' : 'NOT started by the toolkit: do not stop it without asking the user'}`
      : `port ${port}: nothing is listening`);
    return 0;
  }
  if (primary === 'list') {
    const owned = listOwned();
    out(json, { owned }, owned.length === 0 ? 'no toolkit-owned servers are running' : owned.map((entry) => `pid ${entry.pid} port ${entry.port ?? '-'} ${entry.label} (since ${entry.startedAt})`).join('\n'));
    return 0;
  }
  if (primary === 'release') {
    if (!port) throw new Error('release needs --port <n>');
    const approvedPid = flags['approved-pid'] === undefined ? null : Number(flags['approved-pid']);
    const result = await releasePort(port, { approvedPid });
    out(json, result, result.released ? `port ${port}: ${result.reason === 'nothing-listening' ? 'already free' : 'released'}` : result.ask);
    return result.released ? 0 : 2;
  }
  if (primary === 'cleanup') {
    const results = await cleanupOwned({ all: flags.all === true });
    out(json, { stopped: results }, results.length === 0 ? 'nothing to clean up' : results.map((entry) => `stopped pid ${entry.pid} (${entry.label}, port ${entry.port ?? '-'})`).join('\n'));
    return 0;
  }
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => { console.error('[dev-ports]', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
