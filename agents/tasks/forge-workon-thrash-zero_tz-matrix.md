# TZ-matrix — Fixture matrix for thrash modes

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Ready (after TZ-recover + TZ-tab-apply)  
**Priority:** P0  
**Task force:** A implement → B verify  

## Goal

One fixture + expected plan assertions per class:

| Fixture | Expect |
| --- | --- |
| perfect dual-mon | nothingToDo / not thrashed |
| thrash mon1 nested HSPLIT | Mode B: roles + park FB/Chess |
| voice mon-direct out of tab | Mode A or B: structure comms only; no nested term thrash |
| mon-direct companions sane mon | Mode A leave or structure tab (post tab-apply) |
| wrong-mon roles | moves + not dual park thrash |

## Acceptance

- [ ] Fixtures under `tests/unit/cli/fixtures/workon/`  
- [ ] pytest table or class covers all  
- [ ] plan notes  

## Session note

(next agent fills)
