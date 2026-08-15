# forge-layout-in-process_al3-shared-plan-reconcile — planReconcile expected-fixture parity

**Status:** next  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. Do **not** simplify D034/D035.

## Goal

`planReconcile(profile, forestJson, flags) → plan` matches frozen
AL1 expected. Port `actions_to_extension_steps` as `planActionsToSteps`.

## Acceptance

- [ ] Every `tests/unit/cli/fixtures/layout/expected/*.json` plan
      matches (actions, roles, counts, thrashState)
- [ ] Residual replan with `rolePins` / `justOpenedRoles` matches
- [ ] `planActionsToSteps` ported from
      `layout_apply.actions_to_extension_steps` (unused by CLI yet)
- [ ] Cold `ensure_layout` actions are executable later **without**
      `_layoutOp` flatten — if expected plan requires flatten on happy path,
      **stop** and fix the planner (do not encode flatten)
- [ ] gi-free; not under `cli/`
- [ ] Python apply path unchanged

## Context for the next agent (complete + succinct)

- Depends: AL1 + AL2
- D034: title-wait then class-only leftover; chrome-family serialize
  is **executor** (AL6), but claim/class-only must stay in the plan
- D035: plan consumes forest that may include Meta-census windows;
  do not drop `includeMeta` fields if expected fixtures have them
- D008: skeleton before bind; no Mode B mid-batch
- Compare frozen JSON, not live Python (so Python can die in AL8)

## Session note

Stubbed after AL0 lock. No work yet.
