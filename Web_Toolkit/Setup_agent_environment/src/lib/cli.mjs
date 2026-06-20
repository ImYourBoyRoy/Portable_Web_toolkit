// ./Web_Toolkit/Setup_agent_environment/src/lib/cli.mjs
/**
 * Minimal CLI parser for the portable agent environment setup tool.
 */

export function parseCliArgs(argv = []) {
  const command = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      command.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

