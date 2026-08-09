# forge-layout-settle-contract_se3-soft-focus-barrier — SE3 soft focus barrier

**Status:** done  
**Plan:** forge-layout-settle-contract  
**Branch:** plan/forge-layout-cold-topology  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Soft expectation barrier for focus residual: after focus apply, steal → correct +
record + reset quiet; soft timeout from heuristics; unit tests.

## Acceptance

- [x] `run_soft_focus_barrier` pure (inject check/correct/clock)
- [x] `resolve_focus_soft_timeout_ms` from heuristics (max across classes)
- [x] Steal corrects immediately; residual latency recorded; quiet resets
- [x] Wall mult + max_corrections stop infinite thrash
- [x] Wired into `_layout_final_focus_pass` (replaces fixed verify+stable poll)
- [x] Post-settled verify once after soft barrier
- [x] `TestSoftFocusBarrierSe3` green

## Context for the next agent

- **Pure:** `layout_apply.run_soft_focus_barrier`, `resolve_focus_soft_timeout_ms`, `soft_focus_wall_ms`
- **CLI:** `_layout_final_focus_pass` — hard-ready → quiet → apply once → soft barrier → post-settled verify
- **Heuristics:** load store for timeout; in-memory `record_trial` samples; **persist deferred to SE7** (`finalFocusHeuristics.persist=deferred-se7`)
- **First-ever class:** soft timeout = learning trial (6s focus) until samples exist — expected
- **Next:** SE5 extension pin/restore alignment; SE7 disk persist; SE6 geom fold; SE8/CT3 live

## Session note

**2026-08-09:** SE3 + focus-phase wire (SE4 spine) landed same session.
