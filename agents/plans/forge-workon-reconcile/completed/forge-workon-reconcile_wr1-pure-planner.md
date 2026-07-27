# WR1 — Pure workon planner (match/claim/diff → actions)

**Plan:** [forge-workon-reconcile.md](../plans/forge-workon-reconcile.md)  
**Status:** Done (A/B AGREE)  
**Priority:** P1 product

## Goal

Implement a **pure** (no DBus / Shell) planner that turns a GetTree forest +
v2 reconcile profile into a list of actions and a human/JSON report.

## Acceptance

1. Module: `scripts/forge/workon_plan.py` (importable; no process/DBus side effects).
2. Input: GetTree-shaped forest (`{monitors: [...]}`) + validated v2 profile
   (`mode: reconcile` / `roles` + `layout`).
3. Output plan object includes at least:
   - `actions[]` — open / move / park / ensure-layout (or equivalent clear ops)
   - `roles` — per-role outcome (reused / open / move / …)
   - `counts` — reused, opened, moved, parked (and nothing-to-do when zero work)
4. Matching: role `match` claims **at most one** window each (global claim set).
5. Missing role → `open` action using role `open` fields (no actual launch).
6. Unclaimed windows → park to overflow (default primary tabbed overflow).
7. Already-perfect tree → empty or no-op actions; counts show nothing harmful.
8. Unit tests under `tests/unit/cli/` with fixtures including a **doubled black**
   tree (Chrome/Grok/Ghostty/Gmail/YT/Voice duplicates).
9. Existing FC5 `workon_lib` tests still pass; do not break v1 steps validation
   unless intentionally extended for v2 (prefer separate validate path).

## Non-goals (WR1)

- Applying the plan (WR3)
- Host path resolve (WR2)
- Live Shell trial (WR6)
- New DBus methods

## Design notes (from plan)

- Prefer reusing selector grammar subset: `class`, `title`, `title~=` (substr/regex).
- Two Ghostties: separate roles; claim order by preferred mon then any unclaimed.
- Structure: planner may emit ensure-layout / move into named slots; executor
  later maps slots → RunSteps.

## Session note

**Shipped (WR1 pure planner):**

| Piece | Path |
| --- | --- |
| Planner | `scripts/forge/workon_plan.py` |
| Tests | `tests/unit/cli/test_workon_plan.py` (23; B + mon-only reject) |
| Fixtures | `tests/unit/cli/fixtures/workon/` — empty, perfect, doubled-black, profile-dev-v2 |
| v1 untouched | `workon_lib.py` / `test_workon_lib.py` still green (23) |

**Public API:**

- `validate_reconcile_profile(data) -> dict` — v2 / mode reconcile; separate from v1
- `plan_reconcile(forest, profile) -> {ok, nothingToDo, counts, roles, actions, unclaimed}`
- Helpers: `collect_windows`, `window_matches`, `mon_index_from_slot`

**Actions:** `open` / `move` / `park` / `ensure_layout`. Reused = window on slot’s mon index. `nothingToDo` when opened=moved=parked=0 (no ensure spam).

**B verify:** AGREE. Fixed mon-only match reject. Residual: mon-level “reused” only; WR3 maps slots.

**Next agent:** WR2 host path resolve.

**Tests:** `python3 tests/unit/cli/test_workon_plan.py` and `test_workon_lib.py` — OK.
