# TZ-detect — Detect thrashed desk vs sane

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Ready (next session — start here)  
**Priority:** P0  
**Task force:** A implement → B verify  

## Goal

Pure `detect_thrash(forest, profile) → { thrashed, score, reasons[] }` used by
`plan_reconcile` (attach as `plan.thrashState`). No DBus.

## Signals (minimum)

1. Multi-role **tabbed** profile slot: claimed role windows not co-grouped under one TABBED CON.  
2. Profile mon has N mon-level **views**; live mon has ≫ N mon-level children (or deep nested H/V where a single tabbed view was expected for mon-child region containing roles).  
3. Nested HSPLIT/VSPLIT under a mon-child that should be a single role view (fixture from live dump).  
4. Optional: ≥K roles on wrong mon.

Not thrash: only residual leave; order-only tab order.

## Fixture (required)

From live black dump (mon1 nested HSPLIT ghostty + HSPLIT(fb,chess) | TABBED chrome):

`tests/unit/cli/fixtures/workon/tree-thrash-mon1-nested-hsplit.json`

Assert: `thrashed === true`, reasons mention term view / nested split / structure.

Perfect tree fixture: `thrashed === false`.

## Acceptance

- [ ] `detect_thrash` exported from `workon_plan.py` (or sibling pure module)  
- [ ] Fixture thrash + perfect covered  
- [ ] `plan_reconcile` includes `thrashState` (even if Mode B not yet applied)  
- [ ] pytest green for plan tests touched  
- [ ] Task note + plan session note updated  

## Non-goals

- Mode B park/recover apply  
- CLI flags  
- Extension changes  

## Session note

(next agent fills)
