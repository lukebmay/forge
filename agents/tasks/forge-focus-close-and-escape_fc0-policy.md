# forge-focus-close-and-escape_fc0-policy — Pure focus-after-close policy

**Status:** ready  
**Plan:** [forge-focus-close-and-escape](../plans/forge-focus-close-and-escape.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Lock and unit-test a pure function: given closed node + parent + sibling list +
optional LFT/MRU window ids + workspace candidates → **which Meta/window id
to activate**.

## Acceptance

- [ ] Pure helper (JS and/or Python mirror) with table-driven tests:
  - LFT survivor preferred over later sibling
  - no LFT → next sibling → previous sibling
  - sole survivor (collapse case) → that window
  - no siblings → other NORMAL on same workspace
- [ ] Plan doc stays aligned with helper contract
- [ ] No extension wire yet (FC1)

## Context

- Live wire today: `lib/extension/window.js` `_captureFocusRestore` /
  `_restoreFocusAfterWindowClosed` (sibling scan only).
- Collapse: `tree.js` / TreeSnapshot — single-child CON dissolves; survivor
  promoted — focus that window after close.

## Session note

2026-08-09: Policy agreed with operator; FC0 pure first.
