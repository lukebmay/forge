# Task: WS1 — Apply path + current workspace

**Status:** implemented (pending B verify)  
**Plan:** [forge-layout-workspace-scope.md](../plans/forge-layout-workspace-scope.md)  
**Branch:** `plan/forge-layout-workspace-scope`  
**Depends on:** WS0  
**Created:** 2026-08-06  

## Goal

Stop hardcoding workspace 0 in apply. Resolve **current** workspace from the
live session; thread 0-based index through plan/apply; CLI still 1-based later.

## Acceptance

1. `slot_to_monitor_path` / open / move / ensure use target `ws` index, not only 0. **✓**
2. Extension or tree API exposes current workspace index to CLI (`forge tree`
   meta or ping/layout helper). **✓** (`activeWorkspace` + `nWorkspaces` on GetTree forest)
3. `forge layout <name>` (single) applies on **current** workspace after install. **✓** (CLI wires meta → `plan_reconcile` / apply)
4. Save snapshots only that workspace’s mon roots. **✓**
5. Unit tests for path building + save filter; live: layout on ws2 does not touch ws1. **✓** unit; live deferred WS3

## Out of scope

- Multi-name sequential CLI (WS2)
- Name charset (WS2)

## Session note

**2026-08-06 WS1 (Task Force A):**

- **GetTree meta:** `projectForest` + `session-api.GetTree` set `activeWorkspace`
  (0-based Meta index) and `nWorkspaces` from workspace manager.
- **CLI:** `_layout_target_workspace(forest)` via `active_workspace_from_forest`;
  every `plan_reconcile` / `actions_to_extension_steps` / `open_action_to_launch_fields`
  / `residual_follow_up` gets `workspace=`. Human stderr: `workspace  N` (1-based).
  Offline `--tree-file` without meta → workspace 0 (documented).
- **Save:** `capture_tiles_profile(..., workspace=)` + meta auto-filter current desk.
- **Tests:** unit/cli **393** green; tree-query vitest **14** green.
- **Commit:** `fd3d098`.
- **Next:** B verify → then WS2 sequential/static CLI modes.
