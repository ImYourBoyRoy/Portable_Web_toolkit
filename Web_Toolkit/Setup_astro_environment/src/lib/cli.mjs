// ./Web_Toolkit/Setup_astro_environment/src/lib/cli.mjs
/**
 * Minimal CLI argument parsing for the Astro environment setup tool.
 */

export function parseCliArgs(argv) {
  const command = [];
  const flags = {};
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const trimmed = token.slice(2);
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex >= 0) {
        flags[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
      } else {
        const next = argv[index + 1];
        if (next && !next.startsWith('-')) {
          flags[trimmed] = next;
          index += 1;
        } else {
          flags[trimmed] = true;
        }
      }
    } else if (command.length < 2) {
      command.push(token);
    }
    index += 1;
  }
  return { command, flags };
}

