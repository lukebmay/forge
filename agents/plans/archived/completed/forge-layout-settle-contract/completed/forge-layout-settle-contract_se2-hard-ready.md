# forge-layout-settle-contract_se2-hard-ready — SE2 hard-ready barrier

**Status:** done  
**Plan:** forge-layout-settle-contract  
**Branch:** plan/forge-layout-cold-topology  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Hard-ready barrier API: call clock → TILE/rect/mon; 5s timeout; unify LF5 wait.

## Acceptance

- [x] `hard_ready_status` + `wait_until_hard_ready` pure helpers in `layout_apply.py`
- [x] Default `HARD_TIMEOUT_MS` = 5000 (from `settle_heuristics`)
- [x] Call clock via `call_started_mono`
- [x] CLI `wait_for_window_ids_settled` uses pure barrier (residual/belt/focus settle)
- [x] Unit tests `TestHardReadySe2` green

## Context for the next agent

- **Pure:** `hard_ready_status`, `wait_until_hard_ready` — inject `load_windows` / sleep / mono
- **CLI thin wrap:** `wait_for_window_ids_settled(backend, ids, timeout_ms=HARD_TIMEOUT_MS, call_started_mono=…)`
- **LF5 predicate unchanged:** `window_is_settled` / `find_settled_window`
- **Not yet:** SE3 soft focus residual barrier; SE4 focus phase rewire (still fixed quiet + stable poll)
- Next: **SE3** soft expectation barrier (focus residual; heuristics timeouts)

## Session note

**2026-08-09:** SE2 landed. Call sites for residual/belt/focus hard wait use 5s default (dropped ad-hoc 1.5–4s overrides).