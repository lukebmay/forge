# forge-tab-click-drag_pr4-chrome-live-reorder — Chrome float+gap

**Status:** done
**Plan:** [forge-tab-click-drag](../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Agent:** Grok **4.5** · reasoning **high**

## Goal

Same-strip REORDER feels like Chrome: floating min-width chip
under the pointer, gap = chip width, siblings slide when the
chip’s **leading edge** crosses a sibling **centerline**.
Release commits via existing TD1 path. Outline-on-neighbor is
not product UI.

This is **PR4 only**. No foreign-strip join (PR6). No 2D
multi-row (PR5). No wrap default flip. No second DnD engine.

## Acceptance

- [x] `tabStripGapFromFloatingChip` pure in `drag-drop.js`
      (leading edge + centers; ends 0/n; direction flip;
      STACKED Y)
- [x] Units cover centerline table + chip width → gap size
- [x] REORDER enter: float chip (prefer reparent real tab
      actor; grab offset); shrink to min tab width; hide
      in-strip duplicate
- [x] Gap spacer exact chip width; siblings do **not**
      equal-fill into gap during gesture
- [x] Centerline cross → sibling slide (ease ~120–180ms ok)
- [x] Release: `applyTabStripReorder` + `replaceChildren` +
      `commitLayout("tab-strip-reorder")` + `settleTabFocus`
      on dragged only; then equal-fill via normal layout
- [x] **No** `replaceChildren` on every motion
- [x] Product use of `.window-tabbed-tab-reorder-insert` removed
- [x] Pressed class on arm (`window-tabbed-tab-pressed`);
      optional float elevation class
- [x] Click < 8px still reveal-only; peel off strip still
      `_startTabMoveGrab`
- [x] L0 tab-strip-reorder (+ related) green
- [x] Nest mon=1: 3-tab reorder — gap is obvious; release
      matches gap (no XTEST; Shell.Eval / session helpers)

## Context for the next agent (complete + succinct)

### Read first

1. Plan § Product feeling + § Chrome live reorder + PR4.
2. **Watch**
   `agents/plans/forge-tab-click-drag/chrome-tab-drag-reference.webm`
   before coding preview.
3. TD1 commit stays: `applyTabStripReorder` +
   `replaceChildren`. Preview only changes.
4. PR1 chrome layer is shipped — float Z is on/above tab-chrome
   layer, below `top_window_group` / apply overlay.

### Locks (do not reshape)

- Float+gap centerline (not outline-on-neighbor)
- Tree commit on **release only**
- No second DnD engine
- D044 mon-local; no foreign strip join this PR
- Threshold 8px Euclidean; close is not a drag handle
- Press reveals immediately (already)

### Files (primary)

| File | Change |
| --- | --- |
| `lib/extension/drag-drop.js` | pure + float lifecycle + preview |
| `stylesheet.css` (or forge stylesheet path) | pressed/dragging; drop insert product paint |
| `tests/unit/extension/tab-strip-reorder.test.js` | pure + gesture units |

### L0 / nest

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/regression/bug-tab-click-activate.test.js \
  tests/unit/extension/action-pipeline.test.js
./install --kit=vim
forge test nested run --monitors=1 -- bash -lc '…'  # 3-tab reorder via Shell.Eval if needed
forge test nested status   # running: False
```

Prefer `forge test nested run` so nest always stops.

## Session note

**2026-08-17 (PR4 implementer):** **done**.

### Files
- `lib/extension/drag-drop.js` — pures + REORDER float/gap/slide
- `stylesheet.css` — pressed / dragging / gap; outline paint neutered
- `tests/unit/extension/tab-strip-reorder.test.js` — centerline + TD1

**Did not touch** tree-layout / schema (PR2 parallel).

### Pure approach
- `tabStripGapFromFloatingChip({ tabs, chip, axis, dragDirection })`
  → `{ index }` among remaining (0..n)
- Leading edge = max when `dragDirection ≥ 0`, else min
- Gap = first sibling whose center is **strictly after** leading
- `tabStripInsertIndexFromGap(fromIndex, gapIndex)` →
  `applyTabStripReorder` insert-before
- `tabStripFlowLayoutWithGap` packs remaining sizes with
  chip-sized hole at `gapIndex`
- `TAB_REORDER_SLIDE_MS = 150`

### Float approach
- **Reparent** real tab actor onto `forge-tab-chrome` layer
  (clone not used). Grab offset preserved via
  `set_position(pointer - offset)`.
- In-strip: remove tab from decoration; insert
  `window-tabbed-tab-reorder-gap` spacer of chip size;
  freeze sibling expand; `translation_x/y` ease on gap change.
- Chip min width: logical 80 × dpi, capped by home tab width.
- Teardown reparents tab back, destroys spacer, clears
  transforms; cancel does **not** `replaceChildren`.

### L0
67/67 green (29 tab-strip-reorder + 12 click-activate + 26
action-pipeline). Related tab-drag suites also green (77 with
extras).

### Nest mon=1
`forge test nested run --monitors=1`: 3× ghostty → TABBED;
Shell.Eval drove `armTabDrag` / motion / release.
- enter REORDER: `chipFloating`, `hasSpacer`, `chipW=80`
- outline **not** used; pressed + dragging classes on
- stay on strip → `previewGap=2` `insertIndex=3` → commit
  `[A,B,C] → [A,C,B]`
- nest **stopped** (`running: False`)

Tab actor geometry after forced TABBED can be zero until
layout paints; nest stamped transform sizes for hit-test
(same API path as live). Real chrome paint of gap is the
same spacer/float code path.

### Residual risks (PR5 / PR6)
- Multi-row 2D not wired (`tabStripInsertIndex2D` later)
- Foreign-strip gap during MOVE APP (PR6)
- Live decoration allocation can lag; float hit-band uses
  siblingSnap + gap (if stamp wrong, peel early)
- STACKED animation uses same translation path; less host
  smoke than TABBED
- Dead CSS `.window-tabbed-tab-reorder-insert` still present
  (shadow none) — cleanup later OK
