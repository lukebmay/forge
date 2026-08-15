# forge-layout-in-process_al2-shared-plan-normalize — Shared profile IR

**Status:** next  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. gi-free. Do not simplify sugar/desugar.

## Goal

First planner slice: `normalizeProfile` / `validateReconcileProfile`
/ desugar in `lib/shared/layout-plan.js`, gold-parity with frozen
profile IR.

## Acceptance

- [ ] `lib/shared/layout-plan.js` (or sibling under `lib/shared/`)
      exports normalize + validate + desugar
- [ ] **No** `gi://`, `node:`, `fs`, or Meta/Node types
- [ ] Vitest matches AL1 gold profile IR (or Python normalize if
      gold not yet split at this stage)
- [ ] Mon-key / alias / bare-array sugar behavior preserved
- [ ] Python `layout_plan.py` still owns `plan_reconcile` + apply
- [ ] Does not live under `cli/`

## Context for the next agent (complete + succinct)

- Depends: AL1 preferred (gold). Can start against Python tests
  if gold is late — then re-lock to gold.
- Source: `scripts/forge/layout_plan.py`
  `normalize_profile`, `validate_reconcile_profile`, `_desugar_*`
- D036: product policy in `lib/shared/`
- Do not port claim / `plan_reconcile` here (that is AL3)
- Size is a symptom: one module is fine; do not pre-split

## Session note

Stubbed after AL0 lock. No work yet.
