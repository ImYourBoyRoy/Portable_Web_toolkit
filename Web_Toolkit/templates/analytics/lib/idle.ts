// ./Web_Toolkit/templates/analytics/lib/idle.ts
/**
 * Defers a callback until the page has loaded and the browser is idle, so restoring a stored analytics
 * choice never competes with first paint. Erasable-syntax TypeScript; the window is injectable for tests.
 */

interface IdleWindow {
  document?: { readyState: string };
  addEventListener?: (type: string, listener: () => void, options?: { once: boolean }) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => unknown;
  setTimeout: (callback: () => void, delay: number) => unknown;
}

export function deferUntilIdle(run: () => void, win: unknown = globalThis, timeoutMs = 3000): void {
  const w = win as IdleWindow;
  const go = (): void => {
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run, { timeout: timeoutMs });
    else w.setTimeout(run, 250);
  };
  if (w.document && w.document.readyState !== 'complete' && typeof w.addEventListener === 'function') {
    w.addEventListener('load', go, { once: true });
  } else {
    go();
  }
}
