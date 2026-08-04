import type { AccessibilityRun, WritableLike } from './index.d.ts';

export function renderHtmlReport(run: AccessibilityRun): string;
export function renderJsonReport(run: AccessibilityRun, options?: { compact?: boolean }): string;
export function renderJunitReport(run: AccessibilityRun): string;
export function renderMarkdownReport(run: AccessibilityRun): string;
export function renderSarifReport(run: AccessibilityRun): string;
export function writeConsoleReport(run: AccessibilityRun, options?: { color?: boolean; stream?: WritableLike }): null;
