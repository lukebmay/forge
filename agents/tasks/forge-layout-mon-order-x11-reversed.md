# forge-layout-mon-order-x11-reversed

**Status:** ready  
**Priority:** P1 (after action pipeline reliability)  
**Plan:** none (standalone follow-up)  
**Created:** 2026-08-06  
**Host:** black — X11, dual 4K  

## Problem

On **X11**, `forge layout dev` applied a layout with **monitor order reversed** from
what the profile / operator expects (L↔R mon roles flipped relative to the intended
dev layout).

Operator report (2026-08-06): now on X11; layout dev “reversed the monitor order
from what it should be.” File for later — do **not** dig in during action-pipeline.

## Context

- Earlier mon L/R **pane** order work: [completed/forge-layout-mon-order.md](./completed/forge-layout-mon-order.md)
  (`ensure_order` for mon-level children). That is **within-mon** child order, not
  which monitor is mon0 vs mon1 in profile application.
- Claim order history: [layout-mon-claim-order.md](./layout-mon-claim-order.md)
- Product mon L/R naming also touched in layout rename / mon order work.

Likely suspects (for the implementing agent — do not treat as confirmed):

1. Monitor index vs physical L/R / connector order on X11 differs from prior Wayland session assumptions.
2. Profile mon0/mon1 mapping vs `forge tree` / workarea index.
3. Apply path moving windows to the wrong mon index when both mons have similar roles.

## Acceptance

1. Repro: clean dual-mon X11 session, `forge layout plan dev` + `forge layout dev`
   (or apply path used daily) → mon roles match profile (ghostty/tabs placement per mon).
2. Unit or synthetic fixture if the bug is pure planner/claim (mon index flip).
3. Live black X11: after apply, left mon and right mon match operator expectation
   for the `dev` profile (document which mon is left in the task note).
4. Do not regress within-mon `ensure_order` or two-pass claim.

## Out of scope

- Action pipeline AP1–AP5
- soft-rehome rename

## Session note

**2026-08-06:** Filed from operator report after switching to X11. Not started.
Queued behind action pipeline per user request.
