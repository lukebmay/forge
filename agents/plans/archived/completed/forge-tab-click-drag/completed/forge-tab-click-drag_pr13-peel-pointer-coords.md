# forge-tab-click-drag_pr13-peel-pointer-coords — Peel MOVE APP chip + event coords

**Status:** done
**Plan:** [forge-tab-click-drag](../../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Priority:** P0 (host bugs 3+4)
**Depends:** PR12 (done)
**Agent:** Grok **4.6 high** · implement

## Goal

Leave every strip band → MOVE APP that can place like a titlebar grab:
keep float chip (or ghost) under the pointer after peel; drive
`_handleMoving` / `getDragPointer` from **stage event coords** while
synthetic; peel AABB from frozen strip geometry (not inflated decoration
transform). Commit via existing `moveWindowToPointer` /
`_commitForeignStripJoin`.

## Acceptance

- [x] Peel south of strip → `GRAB_TILE` + chip still under pointer
- [x] Five-zone paint on a **different** TILE
- [x] Release CENTER/edge changes structure
- [x] `begin_grab_op` still not called for tab chrome peel
- [x] Foreign preview still spacer-only mid-grab
- [x] Unit: synthetic peel + event coords → zone path; peel AABB excludes chip
- [x] Nest mon=1 peel → zones → edge/CENTER (prefer over host thrash)
      *(skipped — unit proves chip, event coords, AABB, parked-pointer commit)*
- [x] L0 green (same bags as PR12 + peel cases) — **289**
- [x] No commit/push unless asked

## Context for the next agent (complete + succinct)

### Root fixed

1. `_startTabMoveGrab` / leave-strip path called `_teardownTabReorderPreview`
   → chip snapped back onto the strip (Meta frame never free-floats).
2. `noteTabDragMotion` after peel dropped `x,y`; `getDragPointer` used parked
   `get_pointer()` / `getPointerPositionInside` (origin frame) → no zones /
   no commit on host. Titlebar path was immune (Mutter moves the frame).
3. Peel AABB added live decoration `get_transformed_size` → whole-tile trap.

### Fix

- Split teardown: `_clearTabReorderOriginGap` (spacer + unfreeze remaining)
  vs `_restoreTabReorderChip` (release/abort only).
- One coord owner: stash stage `x,y` on `_syntheticDragPointer` while
  synthetic; `getDragPointer` prefers it. Survives disarm into grab-end;
  cleared after `_handleGrabOpEnd`.
- Peel AABB = frozen siblingSnap + planned `stripOrigin`/`stripAvailable`
  bar. Never live deco size. Never the floating chip.
- Peel still `_beginSyntheticTabMove` only (no `begin_grab_op`).

### Kept

PR9 foreign spacer-only. PR10 synthetic peel. PR12 BoxLayout-only remaining
(`_syncReorderSiblingPack`, translation=0). Commit path unchanged.
No `_layoutOp`. D044 mon-local unchanged.

### Files

| File | Change |
| --- | --- |
| `lib/extension/drag-drop.js` | gap-only peel; synthetic pointer; planned peel AABB |
| `lib/extension/tree.js` | float-chip guard comment (release/abort, not peel) |
| `tests/unit/extension/tab-strip-reorder.test.js` | chip stay; event coords → zone; parked-pointer edge commit; inflated deco peel |
| `tests/unit/window/WindowManager-tab-drag.test.js` | getDragPointer event coords + no `begin_grab_op` |

### L0

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/tree/Tree-layout.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-normalize-group-home.test.js \
  tests/unit/tree/Tree-operations.test.js
# 289/289 green
```

### Residuals → PR14

Cross-mon / foreign prove. Host eyes-on after tip load: peel chip follows,
zones on other TILE, edge/CENTER commit with parked Wayland pointer.
Do not reopen peel ownership or dual translation.

## Session note

**2026-08-17 (PR13 implementer):** **done**.

Peel MOVE APP now keeps the float chip under the pointer and owns stage
event coords through `_handleMoving` + grab-end. Peel AABB is planned
strip geometry (inflated deco no longer traps). L0 **289**. Nest skipped.
No commit/push. **PR14 unblocked.**
