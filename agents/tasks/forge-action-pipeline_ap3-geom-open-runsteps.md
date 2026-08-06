# forge-action-pipeline_ap3-geom-open-runsteps

**Status:** in progress  
**Plan:** [forge-action-pipeline](../plans/forge-action-pipeline.md)  
**Branch:** `plan/forge-action-pipeline`  
**Created:** 2026-08-06  
**Depends:** AP1 done (AP2 done preferred for commitLayout)  

## Goal

Align **ExternalGeometry**, **OpenApp**, and **RunSteps** residual paths with
formulas in [docs/dev/actions.md](../../docs/dev/actions.md):

| Class | Recipe |
| --- | --- |
| **ExternalGeometry** | forge/in-slot → **B only**; grab live → no mid-grab C; external drift → **Cq**+**V** |
| **OpenApp** | admit → quiet → M → **Cq** (or **Cf** if frozen) → V |
| **RunSteps** | freeze → M ops quiet → one residual **Cf** → settle |

Use existing `commitLayout` / `requestLayout` / layout-controller where possible.

## Acceptance

1. Geometry sensor path: in-slot / forge-caused does not full-commit when **B only**
   is specified (or document intentional exceptions with tests).
2. Open/window-create paths prefer `commitLayout`/`requestLayout` (Cq) not ad-hoc
   double renderTree; LayoutBatch residual still **one** Cf.
3. RunSteps: single end commit (already largely true) + settle uses
   `settleTabFocus` / `afterFocus` as appropriate — not a second structure C.
4. Unit tests for changed paths green; add/adjust spies where practical.
5. No regression of AP1 focus or AP2 Move/Swap one-commit.

## In scope (approx)

- `layout-sensors.js` / window geometry handlers
- `layout-open.js` / window-create / LayoutBatch residual
- `run-steps.js` / `session-api` RunSteps settle (`_settleAfterRunSteps` / similar)
- SizeOnlyChanged edges only if they clearly double-commit (else AP4)

## Out of scope

- AP4 full command.js facade for every Split/layout toggle
- AP5 live HUP matrix (operator)
- mon-order X11 reverse task

## Session note

(overwrite each prompt)
