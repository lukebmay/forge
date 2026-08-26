# Task: WS0 — Claim/plan scope to one workspace

**Status:** implemented (awaiting B verify)  
**Plan:** [forge-layout-workspace-scope.md](../plans/forge-layout-workspace-scope.md)  
**Branch:** `plan/forge-layout-workspace-scope`  
**Priority:** P0  
**Created:** 2026-08-06  

## Goal

Layout plan must only see and mutate **one target workspace**. Windows on other
workspaces are not candidates for claim, keep, park, or structure.

## Acceptance

1. Dual-ws forest fixture: role match exists only on ws2 → plan for ws1 **opens**
   (or reports missing), does **not** move/claim the ws2 window.
2. Dual-ws: Inkscape (or any non-role) only on ws2 → plan for ws1 does not list it
   kept/parked/moved.
3. Apply steps only target `mo*ws{target}` paths (default target = current when
   wired; for WS0 unit tests pass explicit workspace index).
4. Existing layout unit tests green; no regression of mon L→R bare bind.
5. Do not implement full multi-name CLI yet (WS2) — single-target API is enough.

## Likely paths

- `scripts/forge/layout_plan.py` — window walk, claim, residuals
- `scripts/forge/layout_apply.py` — `slot_to_monitor_path(..., workspace=)`
- Tree/window list from GetTree (`moNwsW` ids)

## Out of scope

- CLI multi-layout grammar (WS2)
- `--collect`
- Tab drag / peel geometry

## Session note

**2026-08-06 (Task Force A):** WS0 shipped.

### What shipped
- `plan_reconcile(..., workspace: int = 0)` filters forest to target ws via
  `filter_forest_workspace` before claim/keep/park/structure/thrash/structure-cmp.
- Off-ws windows are invisible (no claim, keep, park, move).
- Open/move/park actions stamp `workspace`; plan returns `"workspace"`.
- `collect_windows(..., workspace=)` optional filter.
- `actions_to_extension_steps(..., workspace=0)` + `open_action_to_launch_fields`
  dest paths use `moNws{W}` (per-action stamp overrides).

### Key APIs
```python
filter_forest_workspace(forest, workspace=0) -> forest
plan_reconcile(forest, profile, *, workspace=0, ...) -> plan  # plan["workspace"]
collect_windows(forest, *, workspace=None)
actions_to_extension_steps(actions, *, workspace=0, force_close=False)
open_action_to_launch_fields(action, *, workspace=0)
slot_to_monitor_path(slot, workspace=0)  # existing
```

### Tests
- `TestWorkspaceScope` in `test_layout_plan.py` (dual-ws open/not-claim, Inkscape
  isolation, target-ws reuse, default ws0).
- Apply: dest `path:moNwsW`, open tree_path workspace stamp.
- `pytest tests/unit/cli/ -q` → **388 passed**.

### Remaining (WS1+)
- Wire current workspace from extension into CLI apply (stop defaulting live path
  to ws0 only when operator is on another desk).
- Thread `plan["workspace"]` through forge CLI residual replan / PlaceNext.
- WS2 multi-name sequential/static CLI; WS3 docs/dry-run messaging.
