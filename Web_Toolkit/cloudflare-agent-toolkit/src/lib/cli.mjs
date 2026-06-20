// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/cli.mjs
/**
 * Lightweight CLI argument parser for cf-agent commands.
 *
 * Supports:
 * - command segments (e.g., `auth login`)
 * - flags (`--dry-run`, `--json`)
 * - keyed values (`--zone example.com`, `--ttl=24h`)
 */

export function parseCliArgs(argv) {
  const command = [];
  const flags = {};
  const positionals = [];

  let index = 0;
  while (index < argv.length) {
    const token = argv[index];

    if (token === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith('--')) {
      const trimmed = token.slice(2);
      const eq = trimmed.indexOf('=');
      if (eq >= 0) {
        const key = trimmed.slice(0, eq);
        const value = trimmed.slice(eq + 1);
        flags[key] = value;
      } else {
        const next = argv[index + 1];
        if (next && !next.startsWith('-')) {
          flags[trimmed] = next;
          index += 1;
        } else {
          flags[trimmed] = true;
        }
      }
      index += 1;
      continue;
    }

    if (token.startsWith('-')) {
      const short = token.slice(1);
      for (const char of short) {
        flags[char] = true;
      }
      index += 1;
      continue;
    }

    if (command.length < 2) {
      command.push(token);
    } else {
      positionals.push(token);
    }
    index += 1;
  }

  return { command, flags, positionals };
}

export function flagValue(flags, key, fallback = undefined) {
  if (Object.prototype.hasOwnProperty.call(flags, key)) {
    return flags[key];
  }
  return fallback;
}

