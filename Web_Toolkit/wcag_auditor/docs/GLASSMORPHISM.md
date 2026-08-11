# Glassmorphism / frost UI

Glass, frosted panels, and translucent overlays are **supported**. The auditor must not force you to delete them.

## What axe does

On `backdrop-filter`, translucent `rgba`/`hsla`, gradients, and busy image backgrounds, axe-core often returns **color-contrast incomplete**. This toolkit maps that to outcome **`cantTell`**.

That is **unresolved evidence** (exit `3` when `gate.unresolvedEvidence` is `error`) — **not** an automatic fail and **not** a request to remove frost UI.

True contrast failures still appear as **`failed`** and must be fixed or suppressed with a failed-scoped record.

## Recommended path (keep the aesthetic)

1. **Design for AA** on frosted surfaces: raise frost opacity, use text-shadow sparingly, or put a solid/near-solid underlay behind text while keeping the glass look around it.
2. **Verify** with a contrast sampler on the real composite (text over frost over hero), not only token hex pairs.
3. **Record** the check in `wcag-audit/manual-evidence.json` using the starter id **`frost-glass-contrast`** (see `examples/astro/manual-evidence-frost.json`). Set `outcome: "passed"`, `testedAt`, `expiresAt`, and concrete `evidence` (tool, routes, screenshots).
4. **Resolve the axe cantTell** with a **bounded suppression** that includes `outcomes: ["cantTell"]` for `axe/color-contrast` on the affected route(s). Example: `examples/astro/frost-canttell-suppression.example.mjs`.

Suppressions default to `outcomes: ["failed"]` only. Glass incompletes need an explicit `cantTell` outcome list so failed defects stay gated.

## Do not

- Set `gate.unresolvedEvidence: "ignore"` just to ship glass.
- Strip glassmorphism solely to silence the gate when AA contrast is achievable with opacity/underlay tweaks.
- Use an unbounded or unjustified suppression.

## Remediations

`axe/color-contrast` findings with `cantTell` include frost-aware remediation text and tags (`frost-ui-review`, `glassmorphism-friendly`) so dashboards and agents steer toward evidence + design tweaks, not deletion.
