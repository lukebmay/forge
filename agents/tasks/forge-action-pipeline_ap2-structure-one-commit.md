# forge-action-pipeline_ap2-structure-one-commit

**Status:** in progress  
**Plan:** [forge-action-pipeline](../plans/forge-action-pipeline.md)  
**Branch:** `plan/forge-action-pipeline`  
**Created:** 2026-08-06  
**Depends:** AP1 done  

## Goal

StructureChanged formula: **M → exactly one C** per user gesture (Move / Swap /
drag-end), then optional `settleTabFocus` / **P** if needed.

Formulas: [docs/dev/actions.md](../../docs/dev/actions.md) StructureChanged.

## Acceptance

1. Move/Swap/drag-end: **≤1** `renderTree` (or `commitLayout` → one C) per gesture
   (unit spy).
2. Tab open leaf still correct after move in group.
3. No second `move-*-queue` full commit without documented reason.
4. Unit tests green; add spy tests for one-commit.
5. Prefer `wm.commitLayout(reason, { force })` facade if natural; else consolidate
   call sites to a single C path (AP4 can finish command.js facade).

## In scope

| Entry | Notes |
| --- | --- |
| Command Move / Swap / SwapSibling | command.js |
| Keyboard move bindings that commit twice | window.js / keybindings path |
| Drag-drop end | drag-drop.js |
| Any move-*-queue double renderTree | window.js |

## Out of scope

- AP3 geom/open full alignment (can share commitLayout if introduced)
- AP4 full command.js → commitLayout for all structure ops beyond Move/Swap
- Live AP5 matrix (operator/agent HUP after this is fine as smoke)
- afterFocus changes (AP1 done)

## Forbidden

- Two full commits for one gesture without documented reason
- Reintroducing focus-time `renderTree("focus")`

## Session note

(overwrite each prompt)
