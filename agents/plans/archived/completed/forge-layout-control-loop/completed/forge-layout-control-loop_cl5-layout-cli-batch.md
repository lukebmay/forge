# Task: forge-layout-control-loop_cl5-layout-cli-batch

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Completed:** 2026-08-05

## Goal

Layout CLI multi-open: one commit after batch quiet; no mid-batch layout storm.

## Acceptance

Met after A rework r2 + B **AGREE** (round 2). npm 2084; pytest cli 338.

## Session note

**2026-08-05:** CL5 done.

### Shipped
- `beginOpenLayoutBatch` / `endOpenLayoutBatch` (nestable)
- LayoutController.requestLayout gated mid-batch (latch need-commit)
- DBus LayoutBatch + SESSION_API_VERSION 7
- CLI: begin → open → LF6 quiet → residual → finally end
- Tests: mid-batch external geom, nest, residual+end race

### Next
- CL6 optional periodic verify gsetting
- CL7 live Ghostty on black (operator)
