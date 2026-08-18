# forge-tab-click-drag_pr6-foreign-strip-join — Foreign-strip gap + join-at-index

**Status:** done
**Plan:** [forge-tab-click-drag](../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Agent:** Grok **4.6** · reasoning **high**

## Goal

While peeling / MOVE APP (Forge-owned pointer tracking before or without a
full Mutter grab takeover), pointer over **another** TABBED/STACKED group’s
strip band paints the **same** float chip + **gap** as same-strip REORDER.
Release **inserts at the gap index** (move-then-join / D044 mon-local) — not
always append. Tile CENTER (not strip), edge, empty-mon, wrap-in-slot stay
as today.

This is **PR6 only**. Do not reshape PR1 attach, PR4 float+gap contract, or
PR5 2D/wrap-on.

## Acceptance

- [x] Drag tab from group A onto group B’s strip: gap appears on B; release
      inserts at gap index (not always append)
- [x] Cross-mon still rehomes then joins (D044) — no spanning chrome
- [x] Tile CENTER (not strip) still existing join (append/merge as today)
- [x] Edge / empty-mon / wrap-in-slot unchanged
- [x] `mergeWindowsIntoGroup` (or drop-intent path) accepts **insert index**
      rather than always append-then-reorder
- [x] If Mutter grab fully owns motion and strip hit-test is impossible
      without a second DnD engine: **stop**, open hard design note, keep
      tile CENTER join — do **not** invent a second engine
- [x] L0 green: tab-strip-reorder + DnD/merge units touched
- [x] Nest mon=1 only if pointer-adjacent live needed; stop when done
- [x] No commit/push unless orchestrator/operator asks

## Context for the next agent (complete + succinct)

### Read first

1. Plan § **Product feeling** (two gesture modes + re-entry foreign) ·
   § **3. Relocate** (foreign strip gap) · § **PR6**
2. PR5 (2D insert pure + peel union — reuse):
   [completed/forge-tab-click-drag_pr5-2d-wrap-default.md](./forge-tab-click-drag_pr5-2d-wrap-default.md)
3. PR4 float+gap (do not reshape):
   [completed/forge-tab-click-drag_pr4-chrome-live-reorder.md](./forge-tab-click-drag_pr4-chrome-live-reorder.md)

### Done already (do not redo)

| Slice | Status |
| --- | --- |
| PR1 tab-chrome layer | done |
| PR2–PR3 wrap | done |
| PR4 same-strip float+gap | done |
| PR5 2D + peel union + wrap default 20 | done |
| PR6 foreign-strip gap + join-at-index | **done** |

### Locks (do not re-litigate)

- Float+gap + centerline; tree commit on **release only**
- **No second DnD engine**; peel = `_startTabMoveGrab` / existing grab path
- **D044** mon-local groups; cross-mon = move onto dest mon first, then join
- D039–D043; never `_layoutOp`; never `hasLayoutPh` into `skipWindowStructure`
- Nest: **`./scripts/forge/forge-test nested`** only
- Do not reshape PR1 attach / PR4 float / PR5 2D

### Files (primary)

| File | Change |
| --- | --- |
| `lib/extension/tree.js` | `insertWindowIntoGroup`; `mergeWindowsIntoGroup(..., { insertIndex, group })` |
| `lib/extension/drag-drop.js` | `foreignStripInsertIndex` + `findForeignTabStripAtPointer`; MOVE APP hit-test + float/gap + commit |
| `tests/unit/tree/Tree-operations.test.js` | insert-at-index + D044 dest join |
| `tests/unit/extension/tab-strip-reorder.test.js` | pures + peel→foreign gesture |
| `tests/unit/window/WindowManager-drag-drop-comprehensive.test.js` | strip join vs CENTER append |
| `tests/unit/window/WindowManager-normalize-group-home.test.js` | D044 insert-at-index rehome |

### L0 / nest

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-normalize-group-home.test.js \
  tests/unit/tree/Tree-operations.test.js
```

**182/182 green.** Nest skipped — pointer/gap/join unit-proven.

## Session note

**2026-08-17 (PR6 implementer):** **done**. Not blocked on Mutter grab.

### Mutter grab (acceptance 6)

Not a hard stop. Real grab still fires `position-changed` →
`_handleMoving` (same as tile zones). Strip hit-test + gap paint run
there; commit is `moveWindowToPointer` / grab-end. No second DnD engine.

Forge tracking (synthetic `_beginSyntheticTabMove`) uses the same hook
via `noteTabDragMotion`. If `begin_grab_op` returns true, stage
listeners drop but `_handleMoving` still sees motion.

### API

- `tree.insertWindowIntoGroup(group, windowNode, insertIndex)` —
  first-class land index; default append; `_afterMergeGroup` (D044)
- `tree.mergeWindowsIntoGroup(focus, partner, layout, { insertIndex, group })`
  — 4th arg optional; 3-arg callers unchanged (CENTER / keybind / session)
- Dest already TABBED/STACKED + `insertIndex`/`group` → join partner
  into dest at index (not wrap-new-CON / append-then-reorder)

### Wire

- `_handleMoving`: foreign strip band (peel union + pad) → float chip +
  gap via existing PR4/PR5 visuals; hide tile drop-zones
- `moveWindowToPointer` commit: same hit-test →
  `mergeWindowsIntoGroup(destMember, dragged, layout, { insertIndex, group })`
- Tile CENTER (not strip), edge, empty-mon, wrap-in-slot: untouched
- Same-strip REORDER: untouched (`replaceChildren`)

### Pures

- `foreignStripInsertIndex` — TABBED 2D + chip; STACKED Y chip only
- `findForeignTabStripAtPointer` — first non-origin strip union hit

### L0

**182/182 green** (45 tab-strip-reorder + 63 comprehensive DnD + 4
normalize + 70 Tree-ops). Also CommandHandler + drop-intent 84 green
(no caller reshape).

### Nest

**Skipped** — merge insert index + foreign gap index + peel→join
gesture unit-proven. Optional mon=1 eyes-on not required.

### Residual / risk

- Live Mutter grab + float chip on dest strip less host-smoked than
  same-strip PR4 nest
- Titlebar (non-tab) grab over a foreign strip also joins at index
  (same `_handleMoving` hook)
- PR7 docs still open (contracts / DESIGN / user)
- Host lock residual human

### Do not

- Commit/push unless asked
- Reshape PR1/PR4/PR5
- Second DnD engine
