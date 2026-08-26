# TZ-recover — Mode B: roles only + park non-roles

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Done (A/B AGREE)  
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
5. When not thrashed: Mode A residual leave/park as-is (TZ-collect later for tab-marginals).

## Acceptance

- [x] Fixture thrash mon1: roles planned to correct slots; FB+Chess park with destWindowId; chrome roles reused  
- [x] Perfect forest: still nothingToDo / low risk; no mass park  
- [x] counts: parked / moved / structure documented in dry-run meta  
- [x] tests green  
- [x] task + plan notes  

## Non-goals

- Geometry assign  
- CLI `--safe` (TZ-gate)  
- Extension tab bug (TZ-tab-apply) unless blocking unit plan only  

## Session note

**Shipped (TZ-recover Mode B):**

- `plan_reconcile`: call `detect_thrash` **once early**; reuse as `plan.thrashState`.
- When `thrashed` and not `clean`:
  - Skip coexist mon-child span **keep** (no thrash companions in structure).
  - Force residual soft **park** for every unclaimed tile (`destWindowId` via `_soft_park_anchor`).
  - Structure still roles-only (kept empty); mon ensure still gated on role open/move.
- When not thrashed: Mode A residual leave|park|keep unchanged.
- thrash fixture: FB 301 + Chess 302 → park dest=204 (voice, last mon last group); 7 roles reused; no mon ensure.
- doubled-black is also thrashed (mon-children-excess) → Mode B parks extras (tests updated).

**Key APIs / paths**

| Item | Path |
| --- | --- |
| Mode B gate | `scripts/forge/workon_plan.py` `plan_reconcile` (`force_park_residuals`) |
| Soft dump | `_soft_park_anchor` (unchanged) |
| Tests | `TestModeBThrashRecover` in `tests/unit/cli/test_workon_plan.py` |

**pytest:** `tests/unit/cli/` 172 passed.

**Next-agent bullets**

1. B verify: thrash mon1 parks 301/302 with destWindowId; perfect no park; companions-direct still keep when not thrashed.
2. Next task: **TZ-collect** (Mode A tab marginals into views).
3. Do not touch extension focus/tab apply in TZ-collect unless needed.
