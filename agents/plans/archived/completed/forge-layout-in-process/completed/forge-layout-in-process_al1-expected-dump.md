# forge-layout-in-process_al1-expected-dump — Freeze Python plan JSON

**Status:** done  
**Plan:** [forge-layout-in-process](../../forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** grok-4.5. Dump only. **No planner port.**

## Goal

Freeze current Python `plan_reconcile` output as **expected** fixtures so
AL2/AL3 can match JSON without keeping a live Python oracle.

**Naming:** fixture dir is `expected/` — not a color-like “gold” label.
Synthetic hosts use `forgetest`; layout profiles use `layoutA` / `layoutB`
when inventing names (not host color names).

## Acceptance

- [x] Regenerable dump reads `tests/unit/cli/fixtures/layout/` through
      current `plan_reconcile`
- [x] Writes `tests/unit/cli/fixtures/layout/expected/<case-id>.json`
      as `{ profile, forest, flags, plan }`
- [x] Cases include empty, perfect, wrong-mon, extra copy, nested
      HSPLIT, thrash report-only, clean / keepOthers / safe
- [x] At least one residual replan case with `rolePins` /
      `justOpenedRoles`
- [x] README or script header: how to regenerate; do not “improve”
      plans
- [x] No `lib/shared/layout-plan.js`; no DBus; no apply-path edits

## Context for the next agent (complete + succinct)

- Dump: `scripts/forge/dump_layout_expected.py` (`CASES` catalog)
- Expected: `tests/unit/cli/fixtures/layout/expected/*.json` + `README.md`
- Parity: `tests/unit/cli/test_layout_expected.py` (6 tests / 18 subtests)
- Regenerate: `python3 scripts/forge/dump_layout_expected.py`
- Check: `python3 scripts/forge/dump_layout_expected.py --check`
- Product flags: `clean=True` unless keepOthers/safe case
- Residual: `residual-replan-pins` (tree-perfect + rolePins + justOpenedRoles)
- AL2/AL3: compare JS `planReconcile` plan JSON to expected `plan` only

```bash
python3 scripts/forge/dump_layout_expected.py --check
python3 -m pytest tests/unit/cli/test_layout_expected.py -q
```

## Session note

**2026-08-15:** AL1 done. Renamed away from “gold” (confusing with host
color names) → `expected/`. 9 cases; pytest green. No JS planner.
