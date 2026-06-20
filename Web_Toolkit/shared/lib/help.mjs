// ./Web_Toolkit/shared/lib/help.mjs
/**
 * Shared CLI help rendering helpers for portable toolkit entrypoints.
 *
 * Keeps command usage output consistent across tools so agents and humans can
 * scan usage, flags, examples, and exit-code behavior quickly.
 */

function formatList(items = [], indent = '  ') {
  return items.map((item) => `${indent}${item}`);
}

function formatDefinitions(items = [], indent = '  ') {
  return items.map((item) => {
    if (typeof item === 'string') return `${indent}${item}`;
    const name = item.name || item.flag || item.command || '';
    const description = item.description || '';
    if (!description) return `${indent}${name}`;
    return `${indent}${name}\n${indent}    ${description}`;
  });
}

export function renderHelp({
  name = 'tool',
  summary = '',
  usage = [],
  commands = [],
  flags = [],
  examples = [],
  notes = [],
  exitCodes = []
} = {}) {
  const lines = [`${name}${summary ? ` — ${summary}` : ''}`];

  if (usage.length > 0) {
    lines.push('', 'Usage:', ...formatList(usage));
  }

  if (commands.length > 0) {
    lines.push('', 'Commands:', ...formatDefinitions(commands));
  }

  if (flags.length > 0) {
    lines.push('', 'Flags:', ...formatDefinitions(flags));
  }

  if (examples.length > 0) {
    lines.push('', 'Examples:', ...formatList(examples));
  }

  if (notes.length > 0) {
    lines.push('', 'Notes:', ...formatList(notes));
  }

  if (exitCodes.length > 0) {
    lines.push('', 'Exit codes:', ...formatDefinitions(exitCodes));
  }

  return `${lines.join('\n')}\n`;
}

export function printHelp(config = {}) {
  console.log(renderHelp(config).trimEnd());
}

