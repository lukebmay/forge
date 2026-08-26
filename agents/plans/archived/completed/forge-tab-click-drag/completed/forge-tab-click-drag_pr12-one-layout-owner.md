# forge-tab-click-drag_pr12-one-layout-owner — Mid-drag BoxLayout-only (no dual translation)

**Status:** in progress
**Plan:** [forge-tab-click-drag](../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Priority:** P0 (host eyes-on bugs 1+2)
**Depends:** PR11 (kept equal-fill math; this removes dual layout)
**Agent:** Grok 4.5 **high** · implement

## Goal

One mid-drag layout owner for same-strip REORDER (and foreign spacer
preview): gap == chip; remaining equal-fill `(strip − chip)`; siblings
never overlap or overflow. Stop combining `set_width` + BoxLayout reflow
with `translation` from stale `homeStart`.

## Acceptance

- [ ] BoxLayout-only for remaining: spacer + fixed widths; `translation_* = 0`
- [ ] Update snap `homeStart` from pure flow after each gap apply
- [ ] Unit: reallocating mock; painted ranges disjoint; sum+chip ≤ strip
- [ ] Chip re-attach guard in `_applyDecorationRect` while floating
- [ ] PR8 restore + PR10 synthetic peel entry untouched
- [ ] L0 green (tab-strip-reorder + Tree-layout + tab-drag + DnD + normalize + Tree-ops)
- [ ] No commit/push unless asked

## Context for the next agent (complete + succinct)

### Root

PR11 equal-fill + PR4 `translation = seg.start − homeStart` after chip
reparent → St.BoxLayout reallocates **and** translations apply → overflow /
overlap. Unit mocks never reallocated, so L0 missed it.

### Fix

Keep `tabStripEqualFillSizesWithGap` + spacer; zero translations; pack via
host child order; refresh `homeStart` from `tabStripFlowLayoutWithGap`.

### Do not

Second DnD engine; reopen peel `begin_grab_op`; foreign live reparent;
`_layoutOp`. Peel MOVE APP = **PR13**.

## Session note

…
