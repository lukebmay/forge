# WR16 — Quiet workon output + park/companion thrash

**Plan:** [forge-workon-reconcile.md](../plans/forge-workon-reconcile.md)  
**Status:** Done (A/B AGREE)  
**Priority:** P0 (live thrash + daily UX)  
**Repo:** this tree (`scripts/forge/forge`, `workon_plan.py`, tests)

## Problem

1. **`forge workon dev` is too noisy** — dumps full plan / expanded report JSON every run.
   User wants **expanded config/plan only with `--verbose`**.

2. **Live thrash (black):** Normal dev layout OK. Open Facebook + Chess.com
   (Chrome webapps) from right Ghostty, then `forge workon dev` → layout thrash
   and windows unclickable until dock re-activate.

   Contrasts with OK cases: Nautilus already tabbed with left Ghostty → no-op;
   Nautilus vsplitted → joins Ghostty tab (correct).

## Likely root causes

| Issue | Hypothesis |
| --- | --- |
| Noise | `_workon_run_reconcile` always `_print_json` full plan + apply log |
| Thrash | Mon-level Facebook/Chess siblings of bare Ghostty are **not** in a slot CON → **park** → `has_placement` → **mon0+mon1 ensure_layout** + park moves to mon0.overflow → dual-mon rewrite + focus death |
| Focus | Mass move/layout after park; WR14 settle may not fully recover |

## Goal

1. Default workon apply: short human lines only (header, counts, ok / nothing-to-do).  
   Full plan / apply / expanded profile JSON only with **`--verbose`** (and keep
   useful dumps on **errors**; `--dry-run` still prints the plan).
2. Stop dual-mon thrash when lived-in companions sit as mon-level siblings of a
   role tile: either **keep** them under the owning mon-child slot (logical slot)
   and structure-tab if needed, and/or **do not mon-ensure** on park-only plans.
3. Prefer minimal moves; second `workon` still no-op when already satisfied
   (including kept companions already ordered correctly).

## Acceptance

- [x] `forge workon <name>` without `--verbose` does **not** print full plan JSON
- [x] With `--verbose`, plan/apply JSON is printed
- [x] `--dry-run` still shows plan (human + JSON)
- [x] Fixture: perfect mon1 + mon-direct Facebook/Chess next to ghostty-right →
      **kept** (or soft, no mon rewrite thrash); roles still correct; no park of
      those companions if they belong to term slot region
- [x] Park-only residuals that truly stray still park, without rewriting mon
      splits on mons that had no role move/open
- [x] Unit tests for plan thrash/span paths (CLI quiet helpers by inspection; residual)
- [x] Workon unit tests green (`test_workon_{plan,apply,lib}`: 127 passed)

## Non-goals

- Nearest-slot geometry heuristic (plan: later opt-in only) beyond mon-child span
- Changing profile sugar for black `dev.json` unless required
- Full e2e Docker thrash suite

## Session note

**Task Force B: AGREE** (2026-07-27)

Reviewed `git diff` (forge quiet path, `workon_plan` membership + mon ensure
gating, tests, docs). Re-ran:

`python3 -m pytest tests/unit/cli/test_workon_{plan,apply,lib,resolve,capture}.py -q`
→ **160 passed** (plan/apply/lib alone: **127 passed**, matches A).

**Findings (no DISAGREE blockers):**

1. Quiet path correct by inspection: default success/nothing-to-do → no plan
   JSON; `--dry-run` and errors force JSON; `--verbose`/`-v`/`FORGE_VERBOSE=1`
   dump on success. Steps path shares policy.
2. Park-only still parks true strays (wrong mon / left of all mon-child roles);
   mon0/mon1 `ensure_layout` absent; overflow ensure still on park.
3. Mon-child span keep: nearest *preceding* role-owned mon-child only; left-of-role
   mon-direct parks; CON sibling keep (nautilus-style) unchanged; already-tabbed
   companions → nothingToDo.
4. Product shift (extra mon-direct role-class chrome span-kept vs WR11 park) is
   intentional and tested/docs’d in DESIGN + renamed test.
5. Apply order still safe: `actions_to_extension_steps` does place then layout.

**Residual risks (not blockers):**

- No automated unit tests for CLI quiet path (plan coverage strong; quiet is
  thin helpers). Acceptance “CLI quiet path” tests not added.
- Mon-direct residuals *after* a role mon-child always keep+structure-tab under
  coexist (use `strict` to park all unclaimed). Index-order, not geometry.
- Live black FB/Chess thrash smoke not run by B.

**Shipped (Task Force A, verified):**

1. Quiet CLI: `_workon_is_verbose` / `_workon_maybe_print_json`
2. Mon-child span keep in `_build_slot_membership`
3. `has_role_placement` mon ensure gate (not park-only)
4. Docs + fixtures + `TestMonChildSpanAndParkGating`

**Next:** orchestrator wrap (plan status / archive if desired); commit only if
user asks; optional live smoke on black.
