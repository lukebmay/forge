# forge-tab-click-drag_pr8-chip-width-equal-fill — Chip min-width + post-commit equal-fill

**Status:** done
**Plan:** [forge-tab-click-drag](../../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Priority:** P1 (after PR9 freeze/peel if shared files conflict)
**Depends:** none (landed after PR9; preserved peel/foreign safety)

## Goal

During REORDER (and foreign-strip gap), the floating chip must use the
**product min tab width** — wide enough to show ~16–20 characters of
title (same floor as wrap planner / `measureMinTabWidth` at
`min-tab-label-chars`, product default 20). After release into a new
order (or abort), **re-run equal-fill** so settled tabs grow back to
share the strip; fixed drag widths must not stick.

## Operator reports (source)

1. Drag shrink → ellipsis-only; want min size for 16–20 chars.
2. After place, tabs stay small forever; need width algorithm re-run.

## Acceptance

- [x] Chip width floor = `tree.measureMinTabWidth({ minChars })` (or
      equivalent pure) with `minChars` from settings
      (`min-tab-label-chars`, default 20). Not hard-coded 80 logical px
      as the product floor. When minChars=0, keep a sensible chrome
      floor (icon+close+short label) so chip is still readable.
- [x] Chip never shrinks past that floor while REORDER/foreign gap
      (unless home is already smaller — then use max(home, floor) only
      when home is 0; prefer floor over unreadable home if home is
      ellipsis-only from prior bug).
- [x] On commit **and** abort/teardown: restore expand flags **and**
      clear fixed widths on chip + siblings; `commitLayout` /
      `processTabbed` equal-fill runs so tabs share the row again.
- [x] Same-order release (no tree change) still re-layouts strip so
      stuck min widths recover.
- [x] Unit: chip min uses minChars floor; teardown/commit restores
      x_expand and equal-fill path (or asserts width clear + expand).
- [x] L0 green on tab-strip + Tree-layout if touched.
- [x] No commit/push unless asked.

## Context for the next agent (complete + succinct)

### Roots fixed

| Symptom | Cause | Fix |
| --- | --- | --- |
| Ellipsis-only chip | `TAB_DRAG_CHIP_MIN_WIDTH_LOGICAL = 80`; ignored wrap floor | `_tabDragChipMinWidth` → `tree.measureMinTabWidth({ minChars })`; settings `min-tab-label-chars` (default 20); minChars=0 → measure with 1 (chrome+short); pure chrome fallback if tree missing |
| Stay small after drop | Freeze `set_width` + `x_expand=false`; teardown restored siblings only; no width clear; same-order early-return skipped `commitLayout` | Snapshot chip expand; teardown restores chip+siblings expand + `set_width/height(-1)`; always `_relayoutAfterTabStripGesture` on commit (incl. same-order) and cancel |

### Files

| File | Change |
| --- | --- |
| `lib/extension/drag-drop.js` | Chip floor via measureMinTabWidth; chip expand snapshot; clear fixed sizes; always re-layout after reorder/cancel |
| `tests/unit/extension/tab-strip-reorder.test.js` | Chip floor + restore/same-order + abort |

### Locks preserved

- PR9 peel AABB exclude floating chip; foreign preview spacer-only
- One sizing brain with wrap (`measureMinTabWidth` / `minTabWidthFromChars`)
- No second DnD engine; never `_layoutOp`

### L0

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/tree/Tree-layout.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js
# 200/200 green

# PR9 regression (shared drag-drop.js)
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-normalize-group-home.test.js \
  tests/unit/tree/Tree-operations.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js
# 198/198 green
```

### Residual (host)

- Stale glib schema cache may lack `min-tab-label-chars` until
  `./install --kit=vim` recompiles; logout/nest loads tip.
- Host dual-mon eyes-on for PR9 foreign spacer visual still open.
- Nest not required for this pure sizing/restore slice.

## Session note

**2026-08-17:** PR8 done. Replaced 80px hardcode with
`measureMinTabWidth`; teardown restores chip+sibling expand and clears
fixed widths; same-order and cancel always `commitLayout`. PR9 peel/
foreign paths untouched in behavior. Uncommitted on master.
