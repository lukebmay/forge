# forge-action-pipeline_ap3-geom-open-runsteps

**Status:** done  
**Plan:** [forge-action-pipeline](../../forge-action-pipeline.md)  
**Branch:** `plan/forge-action-pipeline`  
**Created:** 2026-08-06  
**Completed:** 2026-08-06  

## Goal

Align ExternalGeometry / OpenApp / RunSteps with action-pipeline formulas via
`commitLayout` + `settleTabFocus`.

## Acceptance

1. [x] Geom forge/in-slot B only (kept)
2. [x] Open + LayoutBatch via commitLayout (one C residual)
3. [x] RunSteps residual Cf + settleTabFocus (no Dfull settle)
4. [x] Tests 2211 pass + geom-open-runsteps spies
5. [x] No AP1/AP2 regressions

## Session note

**2026-08-06 A/B AGREE**

- RunSteps residual `commitLayout("run-steps", { force: true })`
- Settle: `settleTabFocus` per CON
- Open: `_fireOpenCommit` / `endOpenLayoutBatch` via commitLayout
- expand / golden / external max → commitLayout
- Formula doc: LayoutBatch residual one C (Cq or Cf)

### Next
- AP4 remaining command.js → commitLayout
