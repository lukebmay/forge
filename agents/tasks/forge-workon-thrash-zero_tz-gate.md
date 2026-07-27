# TZ-gate — CLI thrash path + safe/force

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Ready (after TZ-recover)  
**Priority:** P0  
**Depends:** TZ-recover  
**Task force:** A implement → B verify  

## Goal

1. `plan_reconcile` / apply automatically uses Mode B when `thrashState.thrashed`.  
2. Human stderr: `thrashState` one line when thrashed; `thrashRisk` when score &gt; 0.  
3. `--safe`: only open missing roles + move roles to correct mon; no park, no structure, no mon ensure.  
4. Optional: refuse apply if thrashRisk score ≥ threshold without `--force` (product: prefer auto Mode B over refuse — pick in implement if conflict; prefer **auto recover**).  

## Acceptance

- [ ] Flags documented in `forge workon help` / workon.md  
- [ ] Dry-run shows mode A vs B  
- [ ] Tests or thin CLI checks  
- [ ] task + plan notes  

## Session note

(next agent fills)
