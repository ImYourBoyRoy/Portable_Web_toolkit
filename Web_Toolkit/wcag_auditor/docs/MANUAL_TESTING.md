# Manual testing

Automation is necessary but incomplete. Manual evidence should cover essential workflows, not isolated pages alone.

## Minimum release evidence

1. Complete every essential workflow with keyboard only. Verify logical order, no traps, visible focus, reachable controls, and recovery from errors.
2. Complete representative workflows with a supported screen reader. Verify names, roles, states, values, landmarks, reading order, announcements, and focus changes.
3. Test zoom, text enlargement, and reflow at supported viewport sizes without loss of information or functionality.
4. Apply text-spacing overrides and verify that content remains readable and operable.
5. Test forced-colors or platform high-contrast mode.
6. Test reduced-motion behavior and any animation, flashing, or auto-updating content.
7. Verify errors, instructions, status messages, time limits, destructive actions, and authentication flows.
8. Verify touch-target and pointer alternatives on relevant devices.
9. Verify captions, transcripts, audio descriptions, and controls for media where present.
10. Test the packaged application, not only the browser development server.

## Evidence quality

A useful record identifies:

- tester
- exact date
- operating system and version
- browser, WebView, or engine version
- assistive technology and version
- route, scene, state, and workflow
- observed result
- screenshot, recording, trace, or written reproduction
- ticket for every failure
- expiration date appropriate to the release cadence

A statement such as “screen reader tested” is not sufficient evidence.

## Glassmorphism / frost panels

Add a dedicated check when the product uses frosted glass, translucent overlays, or `backdrop-filter` panels (starter id: `frost-glass-contrast`).

1. Sample text and essential icons on each frost surface over light and dark backgrounds.
2. Confirm WCAG 1.4.3 AA with a contrast sampler on the composite pixels.
3. Prefer stronger frost opacity, text-shadow, or solid underlays under text — keep the glass look.
4. After a pass, resolve matching axe `cantTell` findings with a bounded suppression `outcomes: ["cantTell"]` for `axe/color-contrast` (see `docs/GLASSMORPHISM.md`).

Do not treat axe incomplete contrast as a reason to delete frost UI.

## Expiration

Set short expirations for rapidly changing UI and longer expirations only for stable surfaces with change detection. Any material UI, engine, accessibility-tree, navigation, or platform change should invalidate related evidence before the date expires.
