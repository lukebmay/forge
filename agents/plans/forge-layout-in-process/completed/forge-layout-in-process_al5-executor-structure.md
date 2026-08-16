# forge-layout-in-process_al5-executor-structure — No-open apply

**Status:** done  
**Plan:** [forge-layout-in-process](../../forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. Use contracts.md named APIs.

## Goal

ApplyLayout runs the structure half of the spine for already-mapped
roles: snapshot → `planReconcile` → steps → RunSteps / setLayout.
No launch yet.

## Acceptance

- [x] In-process forest snapshot via existing tree-query
      (`projectForest`) — not DBus GetTree
- [x] Calls shared `planReconcile` + `planActionsToSteps`
- [x] Executes skeleton / bind / order / size / move via existing
      RunSteps ops
- [x] **Never** calls `SessionApi._layoutOp` (structure uses
      `_setLayoutStructureOp` → `tree.setLayout` I1)
- [x] LayoutBatch not begun for no-open; R027 chrome still at start
      (AL4)
- [x] L0: expected plan → mocked forest + runSteps
- [x] Nest full no-open smoke **not run** this session (note below)
- [x] Focus/soft: focus steps may run; hard-ready/soft stubbed (AL7);
      no GetTree poll
- [x] Open/launch deferred (AL6) — progress messages; place moves still
      run

## Context for the next agent (complete + succinct)

### What executes

| Piece | Path / symbol |
| --- | --- |
| Pure plan+partition | `lib/extension/layout-apply-structure.js` |
| Run bag | `lib/extension/layout-apply-run.js` — `structure` deps |
| Session wire | `session-api._ensureLayoutApplyRuns` + `structure: { snapshotForest, runSteps }` |
| Snapshot | `_snapshotForestForApply` → `projectForest` (+ orphans) |
| Steps | `_runApplyLayoutSteps` → `runStepsDispatch` |
| ensure_layout | `layout` handler → **`_setLayoutStructureOp`** (not `_layoutOp`) |

Flow per apply:

1. Chrome show (AL4)
2. On skeleton enter: snapshot forest → `buildStructurePlan` =
   `planReconcile` + `planActionsToSteps`
3. Phase steps: skeleton / open(place moves) / bind(+close) /
   order(layout+joins+order) / size / focus
4. hard-ready + soft: info stub (AL7)
5. Done: `result.structure`, `openDeferred`, `stepsExecuted`, counts

### ensure_layout mapping (REG-ensure-flatten)

- `planActionsToSteps` still emits `op: "layout"` (+ join moves + order)
- Apply path **overrides** RunSteps `layout` → `_setLayoutStructureOp`:
  mon/multi-window **wrap** via `tree.split` allowed; **no**
  `_flattenLayoutParentToWindows`
- Nested CON under target CON → fail `code=ensure-flatten-refused`
  rather than flatten

### Open actions (AL6)

- Plan may still list `open`; `planActionsToSteps` never emits them
- Progress: `open deferred (AL6): N role(s)…`
- Done: `openDeferred: true`, `openCount`
- Mon place moves (wrong-mon) still run in **open** phase bucket

### LayoutBatch

- Not begun in AL5 (no-open). Chrome is ApplyLayout run chrome only.

### Tests

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-structure.test.js
# 91 pass
```

### Nest retest (not run this session)

```bash
./install --kit=vim
forge nested run --monitors=1 -- forge ping
# When CLI/gdbus can drive ApplyLayout with a no-open profile:
# forge nested run --monitors=1 -- \
#   gdbus call --session --dest org.gnome.Shell.Extensions.Forge \
#   --object-path /org/gnome/Shell/Extensions/Forge \
#   --method org.gnome.Shell.Extensions.Forge.ApplyLayout \
#   '{"profile":{...already-mapped...},"name":"_forge-test-…"}'
```

### Residual for AL6

- Spawn/open + map wait + PlaceNext / LayoutBatch begin-release-end
- Replan after open with `role_pins` / `just_opened_roles`
- Bind after real maps
- Do not invent GetTree poll

### Risks

- H/V subset tab without prior skeleton may wrap; nested CON bags fail
  closed (by design)
- Focus runs if plan emits focus steps (no hard settle yet)
- Profile with only opens still runs skeleton then Done ok with
  openDeferred (partial product until AL6)

## Session note

**2026-08-15:** AL5 structure executor landed. L0 green (91). Nest live
not run. No commit (orchestrator may commit). Next: **AL6** open/map.
