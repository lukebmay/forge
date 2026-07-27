# TZ-detect — Detect thrashed desk vs sane

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Done (A implemented — awaiting B verify)  
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

- [x] `detect_thrash` exported from `workon_plan.py` (or sibling pure module)  
- [x] Fixture thrash + perfect covered  
- [x] `plan_reconcile` includes `thrashState` (even if Mode B not yet applied)  
- [x] pytest green for plan tests touched  
- [x] Task note + plan session note updated  

## Non-goals

- Mode B park/recover apply  
- CLI flags  
- Extension changes  

## Session note

**Shipped (TZ-detect):**

- `detect_thrash(forest, profile) → { thrashed, score, reasons[] }` in
  `scripts/forge/workon_plan.py` (re-validates + mon-key resolve).
- Wired: every `plan_reconcile` return includes `thrashState` (Mode A residual
  leave/park unchanged).
- Signals: tabbed multi-role not co-grouped; mon-children excess (≫ N);
  nested H/V under mon-child role view; ≥2 roles wrong mon.
- Fixture: `tests/unit/cli/fixtures/workon/tree-thrash-mon1-nested-hsplit.json`
  (mo1: HSPLIT(ghostty, HSPLIT(fb,chess)) | TABBED comms).
- Tests: `TestDetectThrash` in `tests/unit/cli/test_workon_plan.py` (4 cases).
- pytest: 79 passed.

**Key APIs / paths**

| Item | Path |
| --- | --- |
| `detect_thrash` | `scripts/forge/workon_plan.py` |
| Helpers | `_claim_roles_for_detect`, `_monitor_for_index`, `_node_has_nested_hv_split` |
| Plan field | `plan["thrashState"]` next to `thrashRisk` |
| Fixture | `tests/unit/cli/fixtures/workon/tree-thrash-mon1-nested-hsplit.json` |

**Next-agent bullets**

1. B verify: thrash true on nested fixture; perfect false; residual leave still
   default; no Mode B park from thrashState yet.
2. Next task: **TZ-recover** (Mode B: roles only + park non-roles to safe dump)
   using `thrashState.thrashed`.
3. Do not touch extension focus/tab apply in TZ-recover unless needed.
