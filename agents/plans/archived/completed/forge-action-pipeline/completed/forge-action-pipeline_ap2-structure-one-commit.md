# forge-action-pipeline_ap2-structure-one-commit

**Status:** done  
**Plan:** [forge-action-pipeline](../../forge-action-pipeline.md)  
**Branch:** `plan/forge-action-pipeline`  
**Created:** 2026-08-06  
**Completed:** 2026-08-06  
**Depends:** AP1 done  

## Goal

StructureChanged for Move / Swap / drag-end: **M → exactly one C** per gesture,
then optional `settleTabFocus` / **P**.

## Acceptance

1. [x] Move/Swap/drag-end ≤1 `renderTree`/`commitLayout` per gesture (unit spy)
2. [x] Tab open leaf correct after move (`settleTabFocus`, no second C)
3. [x] No `move-*-queue` second full commit
4. [x] Tests green + structure-one-commit spies
5. [x] `wm.commitLayout` / `wm.settleTabFocus` introduced

## Session note

**2026-08-06 — A/B AGREE**

### Shipped
- `commitLayout(reason, { force })` — Cf vs Cq
- `settleTabFocus(node)` — F+Dfocus+B without C
- Move: one C + deferred settle (no move-stacked/tabbed-queue C)
- Swap / SwapSibling / WindowSwapLastActive: M → commitLayout → settle → P
- Drag: M-only mid-drop; one C at grab-end
- session-api move/swap via commitLayout; quiet path no mid-batch settle (B fix)
- Tests: 202 files / 2204 pass

### Next
- AP3 geom/open/RunSteps formula alignment
- AP4 remaining command.js → commitLayout
