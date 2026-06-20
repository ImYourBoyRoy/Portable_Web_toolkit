# ./Web_Toolkit/browser_diagnostics/src/python/browser_diagnostics/classify.py
"""Classification helpers for browser diagnostics console and network events."""

from __future__ import annotations

ANALYTICS_URL_HINTS = (
    "posthog.com",
    "google-analytics.com",
    "googletagmanager.com",
    "/cdn-cgi/rum",
    "g.doubleclick.net",
)


def classify_console(message) -> dict:
    """Normalize a Playwright console message into a compact report shape."""

    text = message.text or ""
    level = (message.type or "log").lower()
    return {
        "level": level,
        "text": text[:500],
    }


def classify_request_failure(request) -> dict:
    """Classify failed browser requests, ignoring harmless analytics aborts."""

    error_text = ""
    failure = request.failure
    if callable(failure):
        data = failure() or {}
        error_text = str(data.get("errorText", ""))
    url = request.url
    is_analytics = any(hint in url for hint in ANALYTICS_URL_HINTS)
    ignored = ("net::ERR_ABORTED" in error_text and is_analytics) or (is_analytics and request.resource_type in {"fetch", "ping", "beacon"})
    return {
        "url": url,
        "method": request.method,
        "resourceType": request.resource_type,
        "errorText": error_text,
        "ignored": ignored,
    }


def summarize_console(entries: list[dict]) -> dict:
    """Return aggregate console counts plus a trimmed entry list."""

    errors = [entry for entry in entries if entry.get("level") == "error"]
    warnings = [entry for entry in entries if entry.get("level") == "warning"]
    return {
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "entries": entries[:20],
    }

