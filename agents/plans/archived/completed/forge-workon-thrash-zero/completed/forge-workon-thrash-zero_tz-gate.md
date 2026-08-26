# TZ-gate — CLI thrash path + safe/force

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Done (A/B AGREE)
**Priority:** P0  
**Depends:** TZ-recover  
**Task force:** A implement → B verify  

## Goal

1. `plan_reconcile` / apply automatically uses Mode B when `thrashState.thrashed`.  
2. Human stderr: `thrashState` one line when thrashed; `thrashRisk` when score &gt; 0.  
3. `--safe`: only open missing roles + move roles to correct mon; no park, no structure, no mon ensure.  
4. Optional: refuse apply if thrashRisk score ≥ threshold without `--force` (product: prefer auto Mode B over refuse — pick in implement if conflict; prefer **auto recover**).  

## Acceptance

- [x] Flags documented in `forge workon help` / workon.md  
- [x] Dry-run shows mode A vs B  
- [x] Tests or thin CLI checks  
- [x] task + plan notes  

## Session note

**TZ-gate Done (implementer):** Product path already auto Mode A collect / Mode B
park via `plan_reconcile` thrashState. CLI surfaces `mode=A collect` /
`mode=B thrash-recover`, `thrashState` when thrashed, `thrashRisk` when score&gt;0.
`--safe` → `plan_reconcile(..., safe=True)`: open+move roles only; leave residuals;
skip collect/park/close/structure/ensure; thrashState still reported. No refuse
gate (auto Mode B preferred). `--force` remains clean-only force_close.

| Surface | Detail |
| --- | --- |
| Planner | `workon_plan.plan_reconcile(..., safe=False)` |
| CLI | `forge workon --safe`; stderr thrash mode/state/risk |
| Docs | `cli_help.py` workon help; `docs/user/workon.md` thrash modes |
| Tests | `TestSafeMode` 4 cases; full cli suite 183 |

**Next:** B verify TZ-gate → TZ-matrix / TZ-live.
