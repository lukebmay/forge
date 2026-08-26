# forge-tab-click-drag_pr5-2d-wrap-default — 2D multi-row + peel band + wrap default-on

**Status:** done
**Plan:** [forge-tab-click-drag](../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Agent:** Grok **4.5** · reasoning **high**
**Orchestrator:** started 2026-08-17

## Goal

TABBED multi-row drag uses **2D row pick + chip centerline gap**.
Peel only after leaving the **union of all rows** + pad. Flip
schema default `min-tab-label-chars` → **20** so product wrap-on
lands with multi-row drag ready.

This is **PR5 only**. No foreign-strip join (PR6). Do not reshape
PR1 attach, PR3 wrap planner, or PR4 float+gap contract.

## Acceptance

- [x] `tabStripInsertIndex2D` pure in `drag-drop.js` (plan algorithm):
      cluster rows by Y sort + greedy bucket; pick row by pointer/chip Y
      (nearest if between); row-local gap via `tabStripGapFromFloatingChip`;
      global index = Σ(slots above) + rowLocal
- [x] Missing/zero-size tab rect: inherit previous sibling `{y,height}`;
      first slot inherits next real sibling (else decoration rect) — **never
      `{y:0,height:1}`** fake band
- [x] TABBED REORDER always uses 2D (with chip); STACKED stays Y-axis
      `tabStripGapFromFloatingChip` only — never call 2D for STACKED
- [x] Peel band = union of all tab rects + decoration rect +
      `TAB_STRIP_HIT_PAD_PX` via `pointerOnTabStrip` (row1→row2 stays
      REORDER; south of union peels)
- [x] Schema/default flip: `min-tab-label-chars` → **20** in gschema +
      settings.schema.json (+ prefs/fixtures as needed). Escape: both
      `min-tab-label-chars=0` and `max-tabs-per-line=0` → single row
- [x] Unit table: two rows; chip on row 2; between rows (nearest); after
      last of row1 vs before first of row2; missing-tab Y inherit; first
      missing inherits next real; STACKED does not call 2D
- [x] L0 green: tab-strip-reorder + Tree-layout (+ click-activate /
      action-pipeline if touched)
- [x] Nest mon=1 (optional if pure+wire solid): skipped — pure unit table
      + wire + L0 152 green; multi-row insert proven in units. No XTEST.

## Context for the next agent (complete + succinct)

### Read first

1. Plan § **2D row pick + centerline gap** + § **Peel region** + **PR5**.
2. PR4 float+gap (do not reshape):
   [completed/forge-tab-click-drag_pr4-chrome-live-reorder.md](./completed/forge-tab-click-drag_pr4-chrome-live-reorder.md)
3. PR3 wrap wire (planner live; default was 0):
   [completed/forge-tab-click-drag_pr3-wire-wrap.md](./completed/forge-tab-click-drag_pr3-wire-wrap.md)
4. Chrome reference (already product for float):
   `agents/plans/forge-tab-click-drag/chrome-tab-drag-reference.webm`

### Done already (do not redo)

| Slice | Status |
| --- | --- |
| PR1 tab-chrome layer | done |
| PR2 wrap pures + keys default 0 | done |
| PR3 processTabbed → planTabbedWrap | done |
| PR4 same-strip float+gap centerline | done |
| PR5 2D + peel union + wrap default 20 | **done** |

### Locks (do not re-litigate)

- Float+gap + centerline (PR4); tree commit on **release only**
- No second DnD engine; peel = `_startTabMoveGrab`
- D044 mon-local; no foreign-strip join this PR
- D039–D043 slot machines / overlay all-hard
- Never `_layoutOp`; never put `hasLayoutPh` into `skipWindowStructure`
- Nest: **`./scripts/forge/forge-test nested`** — not user `forge test` /
  top-level `forge nested`. User `forge` is product-only (D045).
- Default nest mon=1; stop nest when done

### Files (primary)

| File | Change |
| --- | --- |
| `lib/extension/drag-drop.js` | `tabStripInsertIndex2D` pure; wire TABBED REORDER; peel union |
| `schemas/…gschema.xml` + `config/settings.schema.json` | default `min-tab-label-chars` **20** |
| `tests/unit/extension/tab-strip-reorder.test.js` | 2D unit table |
| `tests/unit/tree/Tree-layout.test.js` | only if default/fixture assumes 0 |
| `tests/mocks/helpers/testFixtures.js` | may need default 20 or explicit 0 cases |

### L0 / nest

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/tree/Tree-layout.test.js \
  tests/regression/bug-tab-click-activate.test.js \
  tests/unit/extension/action-pipeline.test.js

./install --kit=vim
# Nest only if multi-row live smoke needed:
./scripts/forge/forge-test nested run --monitors=1 -- bash -lc '…'
./scripts/forge/forge-test nested status   # running: False
```

### Do not

- PR6 foreign-strip gap / join-at-index
- Reshape PR1 `attachTabDecoration` / layer Z
- Reshape PR4 float reparent or outline revival as product
- Second pad constant unless outer edge proven tight (raise
  `TAB_STRIP_HIT_PAD_PX` in one place only)
- Commit/push unless orchestrator or operator asks

## Session note

**2026-08-17 (PR5 implementer):** **done**.

### Files
- `lib/extension/drag-drop.js` — `tabStripInsertIndex2D` + TABBED wire + peel union + per-row gap visual
- `schemas/org.gnome.shell.extensions.forge.gschema.xml` — `min-tab-label-chars` default **20**
- `config/settings.schema.json` — same default **20**
- `tests/unit/extension/tab-strip-reorder.test.js` — 2D unit table + multi-row peel AABB
- Fixtures left at `min-tab-label-chars: 0` so unit escape/single-row stays explicit

### Pure approach
- `tabStripInsertIndex2D({ tabs, pointer, chip, dragDirection, decoration })`
  → `{ index }` full child-list insert-before
- Placeholders: missing/zero → inherit prev `{y,height}`; first → next real
  else decoration; marked `skip` for row-local gap
- Cluster: Y-sort stable + greedy bucket (>half smaller-height overlap)
- Pick row by pointer Y (else chip center); nearest if between/outside
- Row gap: `tabStripGapFromFloatingChip` on row slots; map remaining→full
  local; global = Σ(slots above) + rowLocal

### Wire points
- `_updateTabReorderFromPointer`: **TABBED** (`axis !== "y"`) always 2D
  from siblingSnap homes + hole at `fromIndex`; STACKED stays Y chip gap only
- `previewGap` = insertIndex mapped through remaining list for spacer/slide
- `_applyTabReorderGapVisual`: TABBED packs **per Y-row** (no 1D collapse)
- `_collectGroupStripHitRects`: tabs **+** decoration always
- `_tabDragPointerOnStrip`: union of hit rects + snap homes (inter-row stays REORDER)

### L0
**152/152 green** (38 tab-strip-reorder + 76 Tree-layout + 12 click-activate
+ 26 action-pipeline).

### Nest
**Skipped** — pure table + wire solid; optional mon=1 multi-row smoke not required
for done criteria when L0 proves insert/peel contract.

### Residual / risk
- Live multi-row float host move of spacer across row hosts less nest-proven
- Existing user GSettings may still hold `min-tab-label-chars=0` until reset
- PR6 foreign-strip gap still open
