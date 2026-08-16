# forge-canonical-contracts_ic4-settle-fold — Fold leftover CLI waiters

**Status:** skipped  
**Plan:** [forge-canonical-contracts](../../plans/forge-canonical-contracts.md)  
**Also:** [forge-layout-in-process](../../plans/forge-layout-in-process.md) AL8  
**Branch:** master  
**Updated:** 2026-08-15  

## Goal

No third settle brain. Leftover CLI polls/sleeps call the D019 waiters.

## Acceptance

Skip path (AL0 lock): do **not** implement the fold bullets.
When AL8 deletes the Python apply/wait body, close this task as skipped.

- [x] Closed as **skipped** (AL8 thin CLI cutover)

## Session note

**2026-08-15 (AL8):** Product `forge layout` uses ApplyLayout + Progress/Done.
Deleted CLI LayoutBatch chrome/begin, `_layout_final_focus_pass`, and
GetTree poll waiters (`wait_until_hard_ready`, `run_soft_*`,
`wait_for_open_role_pins`). IC4 fold would polish a deleted loop — skip.
Launch/wait-window still uses `wait_for_wm_class` + `window_is_settled`.
