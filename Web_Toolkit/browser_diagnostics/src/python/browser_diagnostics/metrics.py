# ./Web_Toolkit/browser_diagnostics/src/python/browser_diagnostics/metrics.py
"""Performance-observer helpers for browser diagnostics."""

from __future__ import annotations

INIT_SCRIPT = r"""
(() => {
  if (window.__portableBrowserMetricsInstalled) return;
  window.__portableBrowserMetricsInstalled = true;
  window.__portableBrowserMetrics = { paints: {}, lcpMs: 0, cls: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__portableBrowserMetrics.paints[entry.name] = entry.startTime || 0;
      }
    }).observe({ type: 'paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const candidate = entry.startTime || entry.renderTime || entry.loadTime || 0;
        if (candidate > (window.__portableBrowserMetrics.lcpMs || 0)) {
          window.__portableBrowserMetrics.lcpMs = candidate;
        }
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__portableBrowserMetrics.cls = (window.__portableBrowserMetrics.cls || 0) + (entry.value || 0);
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
})();
"""

COLLECT_SCRIPT = r"""
() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const marks = window.__portableBrowserMetrics || { paints: {}, lcpMs: 0, cls: 0 };
  return {
    domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
    loadMs: Math.round(nav.loadEventEnd || nav.duration || 0),
    transferSize: Number(nav.transferSize || 0),
    encodedBodySize: Number(nav.encodedBodySize || 0),
    decodedBodySize: Number(nav.decodedBodySize || 0),
    fpMs: Math.round(marks.paints?.['first-paint'] || 0),
    fcpMs: Math.round(marks.paints?.['first-contentful-paint'] || 0),
    lcpMs: Math.round(marks.lcpMs || 0),
    cls: Number(Number(marks.cls || 0).toFixed(4))
  };
}
"""


def attach_metrics(page) -> None:
    """Attach performance observers before navigation begins."""

    page.add_init_script(INIT_SCRIPT)


def collect_metrics(page) -> dict:
    """Collect browser timing metrics after navigation settles."""

    return page.evaluate(COLLECT_SCRIPT)

