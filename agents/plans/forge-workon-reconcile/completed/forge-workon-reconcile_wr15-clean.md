# WR15 — `forge workon --clean` (opt-in residual close)

**Plan:** [forge-workon-reconcile.md](../plans/forge-workon-reconcile.md)  
**Status:** Done  
**Priority:** P2 (after WR14; WR6 remains live)

## Product lock

| Flag | Behavior |
| --- | --- |
| default | coexist + **park** residuals to overflow (never close) |
| `--clean` | **close** residuals only (after claim + keep); respect close veto |
| `--clean --force` | stronger close where API allows — **never process-kill** |

Kept companions stay. Role windows stay. Only true residuals (would have been parked) close under `--clean`.

## Scope

1. **Planner** (`workon_plan.py`): option `clean=True` → residual actions `op: "close"` instead of `park`; count `closed` (or keep parked count semantics clear).
2. **Apply** (`workon_apply.py` / forge CLI): map `close` → extension close step.
3. **Extension**: RunSteps `close` op using `Meta.Window.delete(time)` (same as tab close button) — not kill -9.
4. **CLI**: `forge workon <name> --clean` and `--clean --force` (force for stronger delete if needed; document).
5. **Tests**: unit for plan clean vs park; apply mapping; run-steps validate if needed.
6. **Help/docs**: brief mention; default still never kills.

## Acceptance

- [x] Default path unchanged: residuals → park
- [x] `--clean`: residuals → close actions; keeps/roles untouched
- [x] Never process-kill; Meta delete only
- [x] Unit tests pass
- [x] Dry-run shows close vs park clearly

## Non-goals

- WR6 live black matrix  
- Closing role windows or kept companions  
- Process kill heuristics  

## Session note

**WR15 shipped (Task Force A).**

- `plan_reconcile(..., clean=False)`: residuals → `op: close` + `counts.closed`; no overflow ensure on clean-only.
- `actions_to_extension_steps(..., force_close=)` → `{op:close, selector:id:…}` (+ `force`).
- RunSteps + SessionApi `_closeOp`: `Meta.Window.delete(roundtrip)`; force skips `can_close`; never `kill()`.
- CLI: `--clean` / `--force` (with clean); help + user/README/DESIGN.
- Tests: plan clean/park/keep/strict, apply close mapping, run-steps validate/dispatch.
