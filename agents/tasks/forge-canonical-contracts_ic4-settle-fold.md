# forge-canonical-contracts_ic4-settle-fold — Fold leftover CLI waiters

**Status:** later — **skip** when D037 ApplyLayout ships (close as
skipped, do not implement)
**Plan:** [forge-canonical-contracts](../plans/forge-canonical-contracts.md)  
**Also:** [forge-layout-in-process](../plans/forge-layout-in-process.md)
(AL0 locked; waiters die in AL8)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-15  
**Note:** If [ApplyLayout](../plans/forge-layout-in-process.md) ships,
**close this as skipped** — do not fold waiters into a loop we are
deleting.

## Goal

No third settle brain. Leftover CLI polls/sleeps call the D019 waiters.

## Acceptance

- [ ] `forge.wait_for_wm_class` uses `wait_until_hard_ready` (or
      `wait_for_open_role_pins` when map-only)
- [ ] `_layout_final_focus_pass` `FINAL_FOCUS_QUIET_MS` sleep removed
- [ ] No new JS `wait_until_hard_ready`
- [ ] Existing layout_apply units still green

**Skip path (AL0 lock):** do **not** implement the bullets above.
When AL8 deletes the Python apply/wait body, close this task as
skipped and tick nothing.

## Context for the next agent

- D019 / `scripts/forge/layout_apply.py`. Catalog § Settle.
- Two brains today: CLI poll vs extension signals.
- **AL0 (2026-08-15):** ApplyLayout moves hard/soft/map waits into
  the extension on Meta signals. `wait_until_hard_ready`,
  `run_soft_*`, `wait_for_open_role_pins`, and
  `FINAL_FOCUS_QUIET_MS` **die with the poll loop**. Folding them
  into each other is wasted work on a deleted path.
- Close as skipped in **AL8** (thin CLI cutover), not before.
- If ApplyLayout is killed/reverted, this task becomes eligible
  again — restore status to `ready` and implement the bullets.

## Session note

**2026-08-15:** AL0 confirmed skip-when-AL-ships. Reason: D038
ApplyLayout deletes CLI GetTree waiters; IC4 fold would polish a
loop AL8 removes. Do not assign.

**2026-08-14:** Later. Do not mix into IC1–IC3.
