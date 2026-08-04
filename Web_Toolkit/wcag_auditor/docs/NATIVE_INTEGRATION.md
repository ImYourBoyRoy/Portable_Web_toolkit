# Native integration

## Evidence contract

Native collectors emit this shape:

```json
{
  "schemaVersion": 1,
  "producer": {
    "name": "my-accessibility-exporter",
    "version": "1.0.0",
    "kind": "bevy-accesskit"
  },
  "surfaceCount": 12,
  "findings": [
    {
      "ruleId": "bevy/name-required",
      "title": "Interactive node has no accessible name",
      "outcome": "failed",
      "severity": "serious",
      "confidence": "high",
      "automation": "automatic",
      "target": {
        "routeOrScene": "settings",
        "selectorOrNode": "entity:184"
      },
      "evidence": {
        "role": "Button",
        "name": ""
      },
      "remediation": "Set an AccessKit name on the interactive node."
    }
  ]
}
```

`surfaceCount` is the number of applicable nodes, states, workflows, or checks inspected. It must not be set to one merely to avoid an empty-surface failure.

## Bevy

Use Bevy's accessibility integration and AccessKit representation as the artifact. Inspect interactive node role, name, description, states, values, bounds, supported actions, focus, tree parentage, and updates after state transitions. Test action requests and keyboard/controller navigation rather than only serializing static nodes.

The JSON adapter does not attempt to reconstruct an AccessKit tree from Rust source. The Bevy application or a test harness owns collection and writes the evidence document.

## Godot

Use AccessibilityServer and Control focus behavior as the artifact. Inspect roles, names, descriptions, values, states, relationships, focus neighbors, initial focus, action support, and updates. Exercise keyboard/controller navigation and screen-reader behavior on supported platforms.

The toolkit ingests the exported evidence without pretending HTML rules apply to Godot scenes.

## Tauri

Use two layers:

1. Browser-mode frontend scenarios for rapid rendered checks.
2. Packaged-binary WebDriver scenarios for the actual WebView, IPC states, window behavior, and platform integration.

A command collector can wrap WebdriverIO, `tauri-driver`, platform inspection tools, or project-specific probes and emit the native contract.

## Command configuration

```js
{
  type: 'command-evidence',
  command: 'cargo',
  args: ['test', '--test', 'accessibility_export', '--', '--nocapture'],
  cwd: '.',
  outputFile: 'target/a11y/bevy-evidence.json',
  timeoutMs: 120000,
  maxOutputBytes: 10485760
}
```

The command is invoked directly, never through a shell. Environment variables must be supplied explicitly through `env`.
