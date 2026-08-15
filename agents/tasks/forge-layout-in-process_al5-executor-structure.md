# forge-layout-in-process_al5-executor-structure — No-open apply

**Status:** draft  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. Use contracts.md named APIs.

## Goal

ApplyLayout runs the structure half of the spine for already-mapped
roles: snapshot → `planReconcile` → steps → RunSteps / LayoutBatch.
No launch yet.

## Acceptance

- [ ] In-process forest snapshot via existing tree-query
      (`projectForest`) — not DBus GetTree
- [ ] Calls shared `planReconcile` + `planActionsToSteps`
- [ ] Executes skeleton / bind / order / size / move via existing
      RunSteps ops
- [ ] **Never** calls `SessionApi._layoutOp`
- [ ] LayoutBatch used only if the plan/open path needs it; no-open
      still shows R027 chrome
- [ ] L0: gold plan → mocked WM/tree
- [ ] Nest `_forge-test-*` no-open smoke when JS lands (mon=1
      unless the case is dual-mon)
- [ ] Focus/soft may still be stubbed (AL7) if cheaper; do not
      invent a GetTree poll

## Context for the next agent (complete + succinct)

- Depends: AL3 + AL4
- REG-ensure-flatten: map `ensure_layout` to `setLayout` +
  merge/order/size
- D014: no belt structure rewrite
- D023: child list only via Node methods
- Do not start launch/map (AL6)

## Session note

Stubbed after AL0 lock. No work yet.
