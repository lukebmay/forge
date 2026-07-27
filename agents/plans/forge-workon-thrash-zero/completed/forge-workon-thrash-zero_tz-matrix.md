# TZ-matrix — Fixture matrix for thrash modes

**Plan:** [forge-workon-thrash-zero.md](../forge-workon-thrash-zero.md)  
**Status:** Done (A/B AGREE)
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

- [x] Fixtures under `tests/unit/cli/fixtures/workon/`  
- [x] pytest table or class covers all  
- [x] plan notes  
- [x] pytest green (`tests/unit/cli/` 188)

## Session note

**TZ-matrix Done — B AGREE.** `TestThrashModeMatrix` locks all 5 plan rows;
fixtures correct; `pytest tests/unit/cli -q` → **188 passed**. No extension
changes.

| Row | Fixture | Locked |
| --- | --- | --- |
| perfect dual-mon | `tree-perfect.json` | not thrashed, nothingToDo, actions=[] |
| thrash mon1 nested HSPLIT | `tree-thrash-mon1-nested-hsplit.json` | Mode B park 301/302, reused 7 |
| voice mon-direct out of tab | `tree-voice-mon-direct.json` | only `mon1.comms` ensure [202,203,204]; parked=0 |
| mon-direct companions | `tree-mon1-companions-direct.json` | Mode A keep 301/302 → tab `mon1.term` |
| wrong-mon roles | `tree-wrong-mon-roles.json` | move 201+202; parked=0; not dual park |

**Next:** **TZ-live**.
