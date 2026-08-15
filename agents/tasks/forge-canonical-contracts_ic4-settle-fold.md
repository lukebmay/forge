# forge-canonical-contracts_ic4-settle-fold — Fold leftover CLI waiters

**Status:** later — **skip** when D037 ApplyLayout ships (close as
skipped, do not implement)
**Plan:** [forge-canonical-contracts](../plans/forge-canonical-contracts.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-14  
**Note:** If [ApplyLayout](../plans/forge-layout-in-process.md) ships, **close
this as skipped** — do not fold waiters into a loop we are deleting.

## Goal

No third settle brain. Leftover CLI polls/sleeps call the D019 waiters.

## Acceptance

- [ ] `forge.wait_for_wm_class` uses `wait_until_hard_ready` (or
      `wait_for_open_role_pins` when map-only)
- [ ] `_layout_final_focus_pass` `FINAL_FOCUS_QUIET_MS` sleep removed
- [ ] No new JS `wait_until_hard_ready`
- [ ] Existing layout_apply units still green

## Context for the next agent

- D019 / `scripts/forge/layout_apply.py`. Catalog § Settle.
- Two brains stay: CLI poll vs extension signals.

## Session note

Later. Do not mix into IC1–IC3.
