# TZ-recover — Mode B: roles only + park non-roles

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Ready (after TZ-detect)  
**Priority:** P0  
**Depends:** TZ-detect  
**Task force:** A implement → B verify  

## Goal

When `thrashState.thrashed`:

1. Plan **role** open/move/structure as usual for profile views.  
2. Every tiled window **not** claimed by a role → **soft park** to safe dump
   (last mon last group / last claimed role window — `destWindowId`).  
3. **No** mon-child span keep collect of chaos.  
4. **No** mon-level ensure solely for parks.  
5. When not thrashed: Mode A is **TZ-collect** (tab marginals into views) — not leave-alone.

## Acceptance

- [ ] Fixture thrash mon1: roles planned to correct slots; FB+Chess park with destWindowId; chrome roles reused  
- [ ] Perfect forest: still nothingToDo / low risk; no mass park  
- [ ] counts: parked / moved / structure documented in dry-run meta  
- [ ] tests green  
- [ ] task + plan notes  

## Non-goals

- Geometry assign  
- CLI `--safe` (TZ-gate)  
- Extension tab bug (TZ-tab-apply) unless blocking unit plan only  

## Session note

(next agent fills)
