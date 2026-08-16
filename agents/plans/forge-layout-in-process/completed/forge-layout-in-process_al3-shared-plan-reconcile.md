# forge-layout-in-process_al3-shared-plan-reconcile — planReconcile expected-fixture parity

**Status:** done  
**Plan:** [forge-layout-in-process](../../forge-layout-in-process.md)  
**Branch:** master  
**Updated:** 2026-08-15  
**Agent:** grok-4.6

## Goal

`planReconcile(profile, forestJson, flags) → plan` matches frozen
AL1 expected. Port `actions_to_extension_steps` as `planActionsToSteps`.

## Acceptance

- [x] Every `tests/unit/cli/fixtures/layout/expected/*.json` plan
      matches (actions, roles, counts, thrashState)
- [x] Residual replan with `rolePins` / `justOpenedRoles` matches
- [x] `planActionsToSteps` ported from
      `layout_apply.actions_to_extension_steps` (unused by CLI yet)
- [x] Cold `ensure_layout` actions are executable later **without**
      `_layoutOp` flatten — cold path uses `ensure_skeleton` only
      (empty-clean: 1 skeleton + 7 opens; no window-anchored ensure_layout)
- [x] gi-free; not under `cli/`
- [x] Python apply path unchanged

## Session note

### Paths

| Item | Path |
| --- | --- |
| Module | `lib/shared/layout-plan.js` (extended AL2; ~5.3k lines) |
| Exports | `planReconcile`, `planActionsToSteps` (+ existing normalize/validate) |
| Tests | `tests/unit/shared/layout-plan-reconcile.test.js` |
| Expected | `tests/unit/cli/fixtures/layout/expected/*.json` (9 cases) |

### Parity

- All 9 AL1 plans deep-equal via Vitest `toEqual` (no key-order
  normalization needed — object insertion order matches Python).
- Flags: camelCase primary (`clean`, `keepOthers`, `safe`, `rolePins`,
  `justOpenedRoles`); snake_case accepted as aliases.
- Signature: `planReconcile(profile, forest, flags)` (profile first —
  JS style); Python remains `plan_reconcile(forest, profile, **kw)`.
- AL2 normalize tests still green (49). AL1 pytest still green (6).

### Flatten concern

- **Not hit.** Cold empty (`empty-clean`) emits `ensure_skeleton` only;
  mid-session cases may emit window-anchored `ensure_layout` (tab join /
  mon repair) — that is existing planner product for residual/structure,
  not cold flatten. AL5 executor must map those via `setLayout` + join,
  not `_layoutOp`.

### Risks

- Large single module (D036 ok; size is symptom). Future split only if
  needed for load, not pre-split planner brain.
- Regex title match + chrome family classEq must stay fixture-true
  (D034/D035); do not “simplify.”
- `split(".", 1)` Python maxsplit ≠ JS limit — port uses `.split(".")[0]`
  / full-split carefully.

### Verify

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js
python3 -m pytest tests/unit/cli/test_layout_expected.py -q
```

### Next

**AL5** structure executor (no-open): consume plan actions →
`setLayout` / order / size / skeleton+bind; no `_layoutOp` flatten.
