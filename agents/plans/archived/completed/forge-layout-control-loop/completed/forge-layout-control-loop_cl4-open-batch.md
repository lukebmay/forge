# Task: forge-layout-control-loop_cl4-open-batch

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Completed:** 2026-08-05

## Goal

Open = batch N=1: quiet + catalog → requestLayout (replace createDelay).

## Acceptance

All met (A + B AGREE). npm test 2075 green.

## Session note

**2026-08-05:** CL4 done.

### Shipped
- `layout-open.js` pure quiet/max-wait helpers
- `trackWindow` → `_scheduleOpenCommit` (recordOpen, quiet reset, max 2.5s)
- Commit: requestLayout("window-create"); freeze → force renderTree once
- Ghostty ≥250ms quiet; dock floor 50; cancel on destroy
- Tests: layout-open + WindowManager-open-commit

### Next
- CL5 layout CLI multi-open same commit+verify
- CL7 live Ghostty on black (operator)
