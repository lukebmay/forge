# forge-tab-multirow-double-height — Multi-row tab strip: tabs ~2× tall

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

When `planTabbedWrap` yields `rowCount > 1`, each tab row/chip is one
`stackedBarHeight` tall.

## Acceptance

- [x] `processTabbed` multi-row pins `row.set_height(barH)` + `tab.set_height(barH)`
      and `y_expand=false` (parity with `processStacked`)
- [x] L0 asserts tab/row height in multi-row Tree-layout tests
- [ ] Host eyes-on after tip load — next session soft

## Context

Root: outer decoration correctly `N×barH`, but tabs/rows were not pinned → St
expand made chips look ~2× tall.

Path: `lib/extension/tree.js` `processTabbed`.

## Session note

Shipped in 2026-08-22 wrap-up commit with min-chars=12.
