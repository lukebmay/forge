# forge-tab-click-drag_pr15-host-residual-lock — Host residual lock

**Status:** done
**Plan:** [forge-tab-click-drag](../../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Priority:** P0
**Depends:** PR14 (done)
**Agent:** Grok **4.6 xhigh** · implement + lock residual product

## Goal

After PR12–PR14 tip load (operator installed + Wayland reset),
mid-drag gap/sibling resize looks good. Close the four host
residuals so Chrome-like tab drag is trustworthy:

1. **Chip track** — peel / MOVE APP chip must not freeze or lag
   behind a fast pointer.
2. **Re-entry gap** — leaving a strip then re-entering the same
   or a foreign strip must show the drop gap again whenever any
   part of the chip intersects that strip band.
3. **Pointer-center scoot** — sibling scoots when the **pointer**
   crosses that sibling’s **center** (not left edge; not chip
   leading-edge). Index 0 must be as reachable as mid/end.
4. **Release residual clear** — one button-release cleanup so
   pressed/highlight and drop-zone paint never stick after a
   plain click or any drag end.

## Acceptance

- [x] Fast peel south/away: chip stays under pointer until release
      (no freeze requiring slow re-pickup)
- [x] Peel then re-enter same strip: gap reappears at pointer-center index
- [x] Peel then enter foreign strip: gap appears; release joins at gap
- [x] Unit: pointer-center pure table (index 0, mid, end, direction)
- [x] Click-only (no 8px travel): no stuck pressed/highlight; no stuck
      drop-zone for that tab
- [x] Any release path (click, reorder, peel drop, abort) clears
      pressed + reorder preview + drop-zone paint
- [x] L0 green: tab-strip-reorder + tab-drag + DnD comprehensive +
      normalize-group-home + Tree-ops (+ Tree-layout if touched)
- [x] No second DnD engine; keep PR10 synthetic peel; PR9 foreign
      spacer-only mid-grab; no `_layoutOp`; no spanning chrome
- [x] No commit/push unless asked
- [x] Session note + move this task to
      `agents/plans/forge-tab-click-drag/completed/` when done;
      update HANDOFF / PRIORITY / plan session note

## Context for the next agent (complete + succinct)

### Root per residual

| Residual | Root | Fix |
| --- | --- | --- |
| Chip lag/freeze | `_syntheticDragPointer` not stashed until after peel; `_handleMoving` from size-changed used parked `getPointer` / `getPointerPositionInside` and yanked the chip | `_syncTabDragChipToPointer` on every motion; `getDragPointer` prefers syn then `lastX/lastY`; never frame-interior during tab peel |
| Gap missing on re-entry | After peel, `_handleMoving` hit **foreign-only** + **pointer-only**; origin excluded; chip∩band ignored | `chipIntersectsTabStrip` / `findTabStripIntersectingChip`; origin re-entry rebuilds gap; foreign uses chip AABB; commit stashes survive disarm |
| Left-edge scoot | `tabStripGapFromFloatingChip` used chip **leading edge** × center | Pointer × sibling center; `dragDirection` unused; chip-only fallback = chip center |
| Stuck pressed / zone | `_disarmTabDrag` skipped `clearAllPreviewHints`; pressed only on stored actor | `clearTabDragResiduals` — pressed/dragging on group tabs + teardown + zones; all release paths |

### Named APIs

- `tabStripGapFromFloatingChip({ pointer })` — pointer×center
- `chipIntersectsTabStrip` · `findTabStripIntersectingChip`
- `_syncTabDragChipToPointer` · `_tabDragChipRect`
- `_reenterOriginStripPreview` · `_commitOriginStripReorder`
- `clearTabDragResiduals`

### Kept

PR9 foreign spacer-only. PR10 synthetic peel (no `begin_grab_op`).
PR12 `_syncReorderSiblingPack`. PR13 event-coord owner. D044 mon-local.

### Prove

L0 **297** green (was 289; +8 PR15). `./install --kit=vim`. Nest
`./scripts/forge/forge-test nested run --monitors=1 -- forge ping`
ok / apiVersion 10; nest **stopped**. Host tip still the previous
logout until operator reloads.

## Session note

**2026-08-17:** Four residuals locked. Chip owner is stage-event
coords on every motion. Chip∩strip-band shows gap (origin re-entry
+ foreign). Scoot is pointer×center. One `clearTabDragResiduals`
on all release paths. Uncommitted with PR6–PR14.
