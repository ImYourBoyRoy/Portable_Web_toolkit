# ./Web_Toolkit/browser_diagnostics/src/python/browser_diagnostics/runner.py
"""Core Playwright browser runner for portable browser diagnostics."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from classify import classify_console, classify_request_failure, summarize_console
from metrics import attach_metrics, collect_metrics
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright


def _route_report(page, host: str, route: str, config: dict) -> dict:
    console_entries: list[dict] = []
    page_errors: list[str] = []
    blocking_failures: list[dict] = []
    ignored_failures: list[dict] = []

    page.on("console", lambda msg: console_entries.append(classify_console(msg)))
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    def on_request_failed(request) -> None:
        item = classify_request_failure(request)
        if item["ignored"]:
            ignored_failures.append(item)
        else:
            blocking_failures.append(item)

    page.on("requestfailed", on_request_failed)
    attach_metrics(page)

    url = f"https://{host}{route}"
    response = None
    navigation_error = ""
    try:
        response = page.goto(url, wait_until="load", timeout=int(config["timeoutMs"]))
        page.wait_for_timeout(int(config["settleMs"]))
    except PlaywrightError as error:
        navigation_error = str(error)

    metrics = {}
    title = ""
    screenshot_path = ""
    try:
        metrics = collect_metrics(page)
        title = page.title()
        if config.get("screenshots"):
            screenshot_dir = Path(config["screenshotsDir"])
            screenshot_dir.mkdir(parents=True, exist_ok=True)
            safe_route = "root" if route == "/" else route.strip("/").replace("/", "__")
            screenshot_path = str(screenshot_dir / f"{host}-{safe_route}.png")
            page.screenshot(path=screenshot_path, full_page=True)
    except PlaywrightError as error:
        navigation_error = navigation_error or str(error)

    return {
        "path": route,
        "url": url,
        "status": response.status if response else 0,
        "ok": bool(response) and response.ok,
        "title": title,
        "metrics": metrics,
        "console": summarize_console(console_entries),
        "pageErrors": page_errors[:20],
        "network": {
            "blockingFailures": blocking_failures[:20],
            "ignoredFailures": ignored_failures[:20],
        },
        "screenshotPath": screenshot_path,
        "error": navigation_error,
    }


def _host_report(browser, host: str, routes: list[str], config: dict) -> dict:
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    report = {
        "host": host,
        "thresholds": {
            "maxLoadMs": config["maxLoadMs"],
            "maxFcpMs": config["maxFcpMs"],
            "maxLcpMs": config["maxLcpMs"],
            "maxCls": config["maxCls"],
        },
        "routes": [],
    }
    try:
        for route in routes:
            page = context.new_page()
            try:
                report["routes"].append(_route_report(page, host, route, config))
            finally:
                page.close()
    finally:
        context.close()
    return report


def run_browser_diagnostics(config: dict) -> dict:
    """Run browser diagnostics using Chromium via Playwright."""

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not bool(config.get("headed")))
        try:
            result: dict[str, Any] = {
                "checkedAt": datetime.now(timezone.utc).isoformat(),
                "profile": config["profile"],
                "projectRoot": config["projectRoot"],
                "python": {
                    "ok": True,
                    "version": sys.version.split()[0],
                    "playwrightBrowsersPath": os.environ.get("PLAYWRIGHT_BROWSERS_PATH", ""),
                },
                "production": _host_report(browser, config["productionHost"], list(config["routes"]), config),
                "development": None,
            }
            if config.get("developmentHost"):
                result["development"] = _host_report(browser, config["developmentHost"], list(config["routes"]), config)
            return result
        finally:
            browser.close()

