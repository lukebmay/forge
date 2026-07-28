# Task: SL4 — STACKED regression pack (CLI unit)

**Status:** done  
**Plan:** [forge-stacked-layouts.md](../../forge-stacked-layouts.md)

## Work

Lightweight CLI/unit regression for stacked product path (engine e2e already partial):

1. Ensure `plan_reconcile` emits `ensure_layout` mode **stacked** when multi-role profile wants stacked and forest is tabbed/split (if not already covered by SL1 tests).
2. Ensure stacked profile + already STACKED forest → structure nothingToDo / no thrash (if gap).
3. Round-trip: save stacked forest → normalize → plan dry structure empty on same forest.
4. Do **not** add Docker e2e or live black (SL5).
5. Mark SL4 done in plan; next = SL5 live (ops) or stop.

## Acceptance

1. Gaps filled or documented as already covered
2. `pytest tests/unit/cli/test_layout_*.py -q` green
3. Plan/PRIORITY updated

## Session note

**2026-07-28 SL4 (Task Force A)**

Audit of SL1/SL3 coverage:

| Case | Before SL4 | Action |
| --- | --- | --- |
| Sugar `{layout:stacked,content}` / split alias | SL1 `test_layout_plan` | skip (covered) |
| Save STACKED → stacked object sugar | SL1 `test_layout_save` | skip (covered) |
| Thrash not-grouped / grouped / nested HSPLIT | SL3 | skip (covered) |
| plan: tabbed forest → ensure mode stacked | **gap** | added |
| plan: flat siblings → ensure mode stacked | **gap** | added |
| plan: tree-stacked-pair nothingToDo | detect only | added plan assert |
| save→normalize→plan structure empty | partial | tightened |

Shipped tests only (no product code):

- `test_layout_plan.py`: `test_plan_stacked_on_tabbed_emits_ensure_stacked`, `test_plan_stacked_on_flat_emits_ensure_stacked`, `test_plan_stacked_pair_nothing_to_do`
- `test_layout_save.py`: `test_stacked_fixture_round_trip` asserts nothingToDo / structure 0 / empty actions

`python3 -m pytest tests/unit/cli/test_layout_{save,plan,lib,resolve}.py -q` → **229 passed**.

Next: **SL5** live black opt-in (ops); no commit this task.
