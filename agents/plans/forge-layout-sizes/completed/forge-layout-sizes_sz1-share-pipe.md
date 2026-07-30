# Task — SZ1: Custom share sugar pipe (save → load → apply)

**Status:** done (implementer)  
**Plan:** [forge-layout-sizes.md](../plans/forge-layout-sizes.md)  
**Branch:** `plan/forge-layout-sizes`  
**Priority:** P1  
**Kind:** Plan-linked  

## Goal

End-to-end: custom sibling shares (`percent` + `userSized`) round-trip through
layout sugar save/load/apply, with a RunSteps size op.

## Scope

| Area | Work |
| --- | --- |
| Sugar | Accept `share` / `ratio` on `{hsplit\|vsplit: …}` (and mon wrap) |
| IR | Split/mon nodes may carry `share: number[]` (renormalized fractions) |
| Save | Capture from GetTree when userSized / unequal; emit `share`; stay bare when equal |
| Plan | `ensure_sizes` after structure/order; windowIds + shares |
| Apply | Map to `{op:"size", windowIds, shares}` |
| Extension | RunSteps handler `size`: set sibling percent + userSized, normalize, render |
| Tests | Pure Python unit tests; JS unit if size op pure-extractable |
| Docs touch | Minimal in-code/help only if needed; full docs → SZ3 |

## Acceptance

1. **Desugar:** `{ "hsplit": ["a","b"], "share": [2,1] }` → IR shares ≈ `[0.667, 0.333]`. ✓
2. **Save:** Forest with mon children userSized 0.7/0.3 → output includes `share` (not bare equal list). ✓
3. **Save equal:** All percent 0 / equal → no `share` key (bare array still works). ✓
4. **Plan:** Profile with shares produces `ensure_sizes` (or equivalent) when roles claimed. ✓
5. **Apply:** Steps include `size` after layout/order. ✓
6. **Extension:** `size` op sets percent + userSized on siblings under common parent; rejects bad input cleanly. ✓
7. **Round-trip unit:** capture → profile_for_output → normalize → shares present in IR. ✓
8. `npm test` / layout Python tests green for touched files. ✓ (272 layout CLI tests + run-steps)

## Out of scope

- Live black install thrash (SZ2)
- Full user docs rewrite (SZ3)
- yuiop keybinds / auto-tile (other plan)

## Session note

**SZ1 verifier (Task Force B)** — branch `plan/forge-layout-sizes` (uncommitted).

**VERDICT: AGREE**

Acceptance 1–8 pass (evidence below). Re-ran tests: 272 pytest + 25 vitest green.
Collateral checks: share length mismatch dropped; bare array no share; tab mon children
emit mon-level share; nested-only share; dual mon+nested `ensure_sizes`; apply order
`move → layout → order → size`; order’s `resetSiblingPercent` is after layout and before
size in the extension batch path.

No wrap-up commit from B (orchestrator owns wrap-up).

### Acceptance

| # | Result | Evidence |
| --- | --- | --- |
| 1 Desugar `[2,1]` | pass | `normalize_shares` + `TestShareSugar.test_desugar_hsplit_share_weights` |
| 2 Save userSized | pass | `TestShareCapture.test_user_sized_emits_share` |
| 3 Save equal bare | pass | `test_equal_percent_no_share` |
| 4 Plan `ensure_sizes` | pass | `test_plan_ensure_sizes_when_claimed`; dual mon+nested ad-hoc |
| 5 Apply size after order | pass | `test_ensure_sizes_after_order`; `place+layout+order+size+focus` |
| 6 Extension `size` | pass | `run-steps` validate + `_sizeOp` (same-parent / mon-direct, reject bad) — no pure `_sizeOp` unit (needs tree) |
| 7 Round-trip unit | pass | `test_roundtrip_normalize_keeps_share` |
| 8 Tests green | pass | 272 + 25 |

### Residual risks (SZ2)

- Live black: resize → save → load → GetTree percent/userSized ±ε
- Order resets percents — apply order must stay size-after-order (wired)
- Min-size auto percent writeback without `userSized` can still emit share when unequal
- `_sizeOp` partial siblings + percent=0 magic is best-effort only
- Install/session path audit still open (SZ2)
