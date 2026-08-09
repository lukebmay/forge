# forge-focus-close-and-escape_fc0-policy — Pure focus-after-close policy

**Status:** completed  
**Plan:** [forge-focus-close-and-escape](../../forge-focus-close-and-escape.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Lock and unit-test a pure function: given closed node + parent + sibling list +
optional LFT/MRU window ids + workspace candidates → **which Meta/window id
to activate**.

## Acceptance

- [x] Pure helper (JS) with table-driven tests:
  - LFT survivor preferred over later sibling
  - no LFT → next sibling → previous sibling
  - sole survivor (collapse case) → that window
  - no siblings → other NORMAL on same workspace
- [x] Plan doc stays aligned with helper contract
- [x] No extension wire yet (FC1)

## Context

- **Helper:** `lib/extension/focus-after-close.js` → `pickFocusAfterClose`
- **Tests:** `tests/unit/extension/focus-after-close.test.js` (12)
- Live wire still: `window.js` `_captureFocusRestore` /
  `_restoreFocusAfterWindowClosed` (sibling scan only) — **FC1** wires helper.

## Session note

2026-08-09: FC0 pure helper + vitest green. Next: FC1 wire into close path.
