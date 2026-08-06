# forge-action-pipeline_ap4-command-commitlayout

**Status:** done  
**Plan:** [forge-action-pipeline](../../forge-action-pipeline.md)  
**Branch:** `plan/forge-action-pipeline`  
**Created:** 2026-08-06  
**Completed:** 2026-08-06  

## Goal

Migrate remaining command.js structure/size handlers to `commitLayout`.

## Acceptance

1. [x] command.js structure/size → commitLayout (zero bare renderTree calls)
2. [x] No double-commit
3. [x] Focus still afterFocus only
4. [x] Tests 2219 pass
5. [x] session-api non-quiet size/order/layout/merge + float no 2nd C

## Session note

**2026-08-06 A/B AGREE**

Migrated Float*, Split, layout toggles, reset sizes, workspace tile toggle,
stacked/tabbed toggles, merge, snap-layout-move, showtab decoration. session-api
non-quiet siblings + float double-C fix.

### Next
- AP5 live X11 HUP smoke matrix
