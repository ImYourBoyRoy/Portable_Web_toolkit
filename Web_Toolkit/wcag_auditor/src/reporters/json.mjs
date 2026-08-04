export function renderJsonReport(run, options = {}) {
  return `${JSON.stringify(run, null, options.compact ? 0 : 2)}\n`;
}
