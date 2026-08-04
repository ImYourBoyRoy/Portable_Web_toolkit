# Architecture

## Design objective

The toolkit answers a narrow question: did the configured accessibility evidence complete, and does that evidence satisfy the project's release policy?

It does not infer whole-product conformance from a source scan or a numerical average.

## Pipeline

1. Load and validate configuration.
2. Execute each required or optional adapter.
3. Normalize findings into a stable contract.
4. Apply bounded suppressions without deleting evidence.
5. Add suppression-governance findings.
6. Reject an empty applicable surface.
7. Evaluate deterministic gate policy.
8. Emit machine-readable and human-readable reports.

## Evidence planes

### Static framework plane

Compiler and framework diagnostics can identify invalid structures close to the source artifact. They cannot observe runtime rendering, computed style, focus order, accessibility APIs, or complete processes.

### Rendered web plane

Playwright moves the application into explicit states. Axe evaluates the rendered document. Geometry and keyboard-focus probes supply additional triage signals while preserving `cantTell` where the toolkit cannot prove a criterion.

### Native plane

Native engines own their accessibility trees and platform bridges. Bevy evidence should be derived from AccessKit nodes and actions. Godot evidence should be derived from AccessibilityServer, Control focus relationships, and real interaction tests. Tauri should test both browser-mode frontend behavior and the packaged WebView.

### Manual plane

Manual evidence records platform, assistive technology, tester, time, result, and artifacts. Expiration prevents an old pass from silently surviving product changes.

## Stable fingerprints

Fingerprints are derived from the rule, adapter, route or scene, state, canonical target, file location, and compact evidence identity. They are designed for review workflows, not cryptographic authentication.

## Extension model

Use the native evidence contract when another process owns collection. Use the command adapter to execute that collector. Use the module adapter when collection belongs inside the Node process. Custom adapters must return findings and a non-negative applicable-surface count.

## Failure containment

One adapter can emit per-file execution errors and continue. A thrown adapter error is converted into system evidence. Optional missing peer dependencies skip only that adapter. A required adapter failure blocks with exit code `2`.
