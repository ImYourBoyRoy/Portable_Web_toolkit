# Rule authoring

Rules should be inspectable, reproducible, and honest about their limits.

## Required design record

Document:

- stable rule ID and version
- applicability
- expectation
- input aspect: source, DOM, CSSOM, geometry, accessibility tree, interaction, or manual
- automation level
- assumptions
- limitations
- standards mapping
- passing, failing, inapplicable, and inconclusive examples
- remediation

## Outcome discipline

Use `failed` only when the evidence establishes that the rule expectation is not met. Use `cantTell` when automation identifies a suspect condition but human judgment or unavailable context is required. Use `inapplicable` only after applicability was evaluated. Use `untested` when a required check was not performed. Use `executionError` when trustworthy evidence was not produced.

Do not convert `cantTell` into a pass. Do not omit execution errors from the denominator because the toolkit has no compliance denominator.

## Standards mappings

- `conformance`: the rule directly evaluates a stated requirement within its declared assumptions.
- `secondary`: the result contributes evidence but does not independently determine the requirement.
- `policy`: an internal quality rule that may be stricter or operationally different.

A policy may cite a WCAG criterion for context while remaining marked secondary. This is appropriate for the target-size and focus probes.

## ACT alignment

The result vocabulary and rule documentation are inspired by ACT Rules Format 1.1. An internal rule is not automatically an approved ACT rule, and passing one implementation does not establish that every aspect of a WCAG requirement was tested.
