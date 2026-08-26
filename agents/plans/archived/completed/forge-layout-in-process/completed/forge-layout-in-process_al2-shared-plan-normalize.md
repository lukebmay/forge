# forge-layout-in-process_al2-shared-plan-normalize — Shared profile IR

**Status:** done  
**Plan:** [forge-layout-in-process](../../forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. gi-free. Do not simplify sugar/desugar.

## Goal

First planner slice: `normalizeProfile` / `validateReconcileProfile`
/ desugar in `lib/shared/layout-plan.js`, expected-fixture parity with frozen
profile IR.

## Acceptance

- [x] `lib/shared/layout-plan.js` (or sibling under `lib/shared/`)
      exports normalize + validate + desugar
- [x] **No** `gi://`, `node:`, `fs`, or Meta/Node types
- [x] Vitest matches AL1 expected profile IR (or Python normalize if
      expected fixtures not yet split at this stage)
- [x] Mon-key / alias / bare-array sugar behavior preserved
- [x] Python `layout_plan.py` still owns `plan_reconcile` + apply
- [x] Does not live under `cli/`

## Context for the next agent (complete + succinct)

- Depends: AL1 preferred (AL1 expected dump). Can start against Python tests
  if expected dump is late — then re-lock to expected fixtures.
- Source: `scripts/forge/layout_plan.py`
  `normalize_profile`, `validate_reconcile_profile`, `_desugar_*`
- D036: product policy in `lib/shared/`
- Do not port claim / `plan_reconcile` here (that is AL3)
- Size is a symptom: one module is fine; do not pre-split

## Session note

**2026-08-15 AL2 done**

### Paths / symbols

| Path | Role |
| --- | --- |
| `lib/shared/layout-plan.js` | Pure ESM: `normalizeProfile`, `validateReconcileProfile`, `normalizeShares`, `monHeadAndRest`, constants; internal desugar |
| `scripts/forge/dump_layout_normalize_expected.py` | Regenerable Python oracle dump |
| `tests/unit/cli/fixtures/layout/expected-normalize/` | 46 frozen cases + README |
| `tests/unit/shared/layout-plan-normalize.test.js` | Vitest deep-equal vs oracle (49 tests) |

JS opts accept both snake (`mon_count` / `mon_indices`) and camel
(`monCount` / `monIndices`).

### Regenerate normalize expected

```bash
python3 scripts/forge/dump_layout_normalize_expected.py
npm test -- tests/unit/shared/layout-plan-normalize.test.js
```

### Proven

- 49/49 Vitest green (46 fixture cases + export/shares checks)
- `python3 -m pytest tests/unit/cli/test_layout_expected.py -q` still 6 pass
- Import smoke: no `gi://` / `node:` / `fs` in module
- Bare dual + `mon_count` / `mon_indices` fold and L→R binding match Python
- Alias monitors, tagged containers, PWA/chrome sugar, focus/active, shares

### NOT ported (AL3+)

- `plan_reconcile` / claim / open pins residual replan
- `actions_to_extension_steps` / thrash / forest mon helpers used only by plan
- DBus apply path (AL4 already stubbed)
- No product sugar behavior changes

### Risks

- JS `casefold` ≈ `toLowerCase` (ASCII tokens only in fixtures)
- Timeout/int coercion: `Math.trunc` / `parseInt` mirrors Python `int()`
- Per-mon `sN` id counters (not global) — keep when extending desugar
- Full plan parity still Python until AL3

### Next

AL3: `planReconcile` pure JS matching AL1 `expected/*.json` plan objects.
