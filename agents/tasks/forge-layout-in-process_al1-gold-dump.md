# forge-layout-in-process_al1-gold-dump — Freeze Python plan JSON

**Status:** ready  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none) — start after operator ack of AL0  
**Updated:** 2026-08-15  
**Agent:** `grok-4.5` as 4.5 **low**. Dump only. **No planner port.**

## Goal

Freeze current Python `plan_reconcile` output as gold fixtures so
AL2/AL3 can match JSON without keeping a live Python oracle.

## Acceptance

- [ ] Regenerable dump (script or documented pytest) reads
      `tests/unit/cli/fixtures/layout/` through current
      `plan_reconcile`
- [ ] Writes `tests/unit/cli/fixtures/layout/gold/<case-id>.json`
      as `{ profile, forest, flags, plan }`
- [ ] Cases include empty, perfect, wrong-mon, extra copy, nested
      HSPLIT, thrash report-only, clean / keepOthers / safe
- [ ] At least one residual replan case with `rolePins` /
      `justOpenedRoles`
- [ ] README or script header: how to regenerate; do not “improve”
      plans
- [ ] No `lib/shared/layout-plan.js`; no DBus; no apply-path edits

## Context for the next agent (complete + succinct)

- Planner: `scripts/forge/layout_plan.py` `plan_reconcile`
- Existing inputs already under `tests/unit/cli/fixtures/layout/`
- Callers: `tests/unit/cli/test_layout_plan.py`,
  `test_layout_apply.py`, `test_layout_save.py`
- D034/D035 must appear in gold if those fixtures exercise them —
  do not drop fields
- Flags default like product CLI: `clean=True` unless the case is
  keepOthers/safe
- Do not assign to someone who will start the JS port in this slice

## Session note

Stubbed after AL0 lock. No work yet.
