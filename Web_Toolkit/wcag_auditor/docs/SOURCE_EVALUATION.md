# Source evaluation

Reviewed on 2026-07-30.

| Source | Artifact proximity | Use | Incentive or conflict note |
|---|---|---|---|
| W3C WCAG 2.2 Recommendation | Normative primary standard | Criterion levels, conformance boundaries, target size, focus appearance | Standards body; no product-sales dependency for this toolkit |
| W3C ACT Rules Format 1.1 Recommendation, 2026-02-05 | Normative primary standard | Rule transparency and outcome discipline | Standards body |
| Playwright accessibility-testing documentation | Official implementation documentation | Rendered-state workflow and axe integration | Microsoft-led project benefits from Playwright adoption |
| Deque axe-core repository and API documentation | Maintainer source and executable engine | Automated DOM analysis and incomplete results | Deque maintains axe-core and sells commercial accessibility products |
| Svelte compiler-warning documentation | Official framework documentation | AST/compiler accessibility diagnostics | Framework project benefits from Svelte adoption |
| Tauri WebDriver documentation | Official framework documentation | Packaged WebView and browser-mode test strategy | Framework project benefits from Tauri adoption; some third-party driver options are commercial |
| Bevy `bevy_a11y` generated crate documentation | Direct API artifact | AccessKit integration and accessibility node model | Project documentation |
| Godot AccessibilityServer and focus-navigation documentation | Official engine documentation | Native accessibility tree and focus behavior | Project documentation |

Primary references:

- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/TR/act-rules-format/
- https://playwright.dev/docs/accessibility-testing
- https://github.com/dequelabs/axe-core
- https://svelte.dev/docs/svelte/compiler-warnings
- https://v2.tauri.app/develop/tests/webdriver/
- https://docs.rs/bevy/latest/bevy/a11y/
- https://docs.godotengine.org/en/stable/classes/class_accessibilityserver.html
- https://docs.godotengine.org/en/stable/tutorials/ui/gui_navigation.html
