import path from 'node:path';
import { atomicWriteFile, normalizePath } from '../core/filesystem.mjs';
import { resolveOutputFile } from '../core/path-policy.mjs';
import { ReporterError } from '../core/errors.mjs';
import { writeConsoleReport } from './console.mjs';
import { renderHtmlReport } from './html.mjs';
import { renderJsonReport } from './json.mjs';
import { renderJunitReport } from './junit.mjs';
import { renderMarkdownReport } from './markdown.mjs';
import { renderSarifReport } from './sarif.mjs';

const RENDERERS = Object.freeze({
  html: renderHtmlReport,
  json: renderJsonReport,
  junit: renderJunitReport,
  markdown: renderMarkdownReport,
  sarif: renderSarifReport
});

export async function runReporters(run, reporterConfigs, context = {}) {
  const fileReporters = reporterConfigs.filter((entry) => entry.type !== 'console').map((reporter) => {
    const render = RENDERERS[reporter.type];
    if (!render) throw new ReporterError(`Unknown reporter type: ${reporter.type}`);
    if (typeof reporter.file !== 'string' || reporter.file.trim() === '') {
      throw new ReporterError(`${reporter.type} reporter requires file`);
    }
    const file = resolveOutputFile(run.outputDirectory, reporter.file);
    return {
      reporter,
      render,
      file,
      relative: normalizePath(path.relative(run.project.root, file))
    };
  });
  const reportFiles = fileReporters.map((entry) => entry.relative);
  run.reportFiles = reportFiles;
  for (const entry of fileReporters) {
    const content = entry.render(run, entry.reporter.options ?? {});
    await atomicWriteFile(entry.file, content);
  }
  if (!context.quiet && reporterConfigs.some((entry) => entry.type === 'console')) {
    writeConsoleReport(run, { color: context.color, stream: context.stream });
  }
  return reportFiles;
}

export {
  renderHtmlReport,
  renderJsonReport,
  renderJunitReport,
  renderMarkdownReport,
  renderSarifReport,
  writeConsoleReport
};
