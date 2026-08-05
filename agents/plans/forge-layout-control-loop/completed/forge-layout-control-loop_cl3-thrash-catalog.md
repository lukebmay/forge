# Task: forge-layout-control-loop_cl3-thrash-catalog

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Completed:** 2026-08-05

## Goal

In-memory app thrash catalog v1 with Ghostty built-in + thrash-extra verify.

## Acceptance

All met (A + B AGREE). npm test 2046 green.

## Session note

**2026-08-05:** CL3 done.

### Shipped
- `app-thrash-catalog.js` — ghostty sticky needsExtraVerify, minQuietMs=250, score
- LayoutController thrash-extra once per SETTLED wave
- External geometry notes postMap / postApplyDrift (suppress never reaches)
- Tests: catalog + controller latch + WM wire

### Next
- CL4: open path = batch N=1 through quiet + catalog (replace blind createDelay)
