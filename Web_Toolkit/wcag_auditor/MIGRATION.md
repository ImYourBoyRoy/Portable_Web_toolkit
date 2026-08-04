# Migration to 2.0

Version 2.0 is an intentional replacement rather than a compatibility release.

## Removed behavior

- Source-code regular-expression auditing
- Percentage scores
- `AA PASS` or `AAA PASS` labels
- Successful exit codes when findings exist
- Successful empty-directory and missing-target runs
- Direct-file behavior that was documented but not implemented

No compatibility shim is included. Existing scripts should be deleted and replaced with the package entry point.

## Replacement workflow

1. Install the package and the optional adapters used by the project.
2. Run `wcag-auditor init`.
3. Define rendered scenarios for essential states and complete processes.
4. Keep framework diagnostics as a separate adapter.
5. Add current manual evidence for checks automation cannot establish.
6. Configure CI to preserve exit codes `0`, `1`, `2`, and `3` distinctly.
7. Review JSON or SARIF fingerprints before creating a bounded suppression.

## Result-model change

Every result has an explicit outcome. A lack of emitted failures is not equivalent to tested conformance. `cantTell`, `untested`, and `executionError` remain visible and can block release independently.
