# forge-tab-click-drag_pr11-mid-drag-gap-equalize — Mid-drag gap=chip + remaining equal-fill

**Status:** done
**Plan:** [forge-tab-click-drag](../../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Priority:** P1 (feel; chip shrink already worked)
**Depends:** PR10 (kept synthetic peel; not reopened)
**Agent:** Grok **4.5** · implement

## Goal

During same-strip REORDER (and foreign gap preview): when the floating
chip shrinks to product min width, the **gap left in the strip must be
that same min width**, and the **remaining tabs must equal-fill the
rest of the strip** (standard equal-fill over remaining slots). They
must **not** expand into the gap itself. On release / abort, PR8
post-commit equal-fill still runs on the full strip.

## Acceptance

- [x] On enter REORDER: gap spacer width/height on axis = chip size
- [x] Remaining siblings **resize** to equal-fill `(stripInner − chipSize)`
- [x] Gap stays reserved; siblings never claim the gap slot
- [x] Multi-row: equal-fill per row with gap reserve on gap row only
- [x] STACKED: same on Y via shared equal-fill path
- [x] Commit / abort: PR8 restore expand + clear fixed widths + commitLayout
- [x] Unit: pure + enter REORDER gap==chipW; sum remaining ≈ strip − chipW
- [x] L0 green (full PR10 regression suite + Tree-layout)
- [x] No commit/push unless asked

## Context for the next agent (complete + succinct)

### Root fixed

| Symptom | Cause | Fix |
| --- | --- | --- |
| Mid-drag gap stays large pre-drag width; remaining do not grow | `_snapshotReorderSiblings` froze siblings at **pre-drag** equal-fill sizes; chip/spacer used min width so `(homeW − chipW)` was dead space | Pure `tabStripEqualFillSizesWithGap`; snapshot + gap visual resize remaining to equal-fill `(available − chip)` per strip/row; gap spacer stays chip-sized |

### Files

| File | Change |
| --- | --- |
| `lib/extension/drag-drop.js` | `tabStripEqualFillSizesWithGap`; snapshot stores `homeSize`/`stripAvailable`/`dragHome*`; `_equalFillReorderSiblings` + row bands; apply visual re-fills per gap row |
| `tests/unit/extension/tab-strip-reorder.test.js` | pure equal-fill + enter REORDER integration |

### Locks preserved

- PR10 peel always synthetic GRAB_TILE (untouched)
- PR9 foreign spacer-only
- PR8 post-commit restore expand + clear widths + `commitLayout`
- No second DnD engine; never `_layoutOp`

### L0

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/tree/Tree-layout.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-normalize-group-home.test.js \
  tests/unit/tree/Tree-operations.test.js
# 283/283 green
```

### Residual (host)

- Eyes-on after install/logout: drag tab → gap == chip min; remaining
  grow; multi-row gap row; STACKED column; foreign strip preview.
- Peel free-float residual from PR10 unchanged (zones use pointer).

## Session note

**2026-08-17:** PR11 done. Mid-drag remaining equal-fill with chip-sized
gap reserve. PR10 peel path not reopened. Uncommitted on master with
PR6–PR10.
