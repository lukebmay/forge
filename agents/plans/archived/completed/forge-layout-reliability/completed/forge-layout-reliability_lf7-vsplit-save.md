# LF7 — Mon-level VSPLIT lost on `layout save` / restore

**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Status:** done  
**Branch:** `plan/forge-layout-reliability`  
**Pri:** P0 restore correctness

## Repro (black)

1. Default dual-mon desk; left mon has Ghostty (alone or as mon child).
2. Open Nautilus **under** left Ghostty (mon becomes VSPLIT: ghostty above, nautilus below).
3. `forge layout save t1`
4. Close Nautilus.
5. `forge layout t1`

**Observed:** Nautilus opens **to the right** of Ghostty (HSPLIT), not below (VSPLIT).

## Root cause

`capture_tiles_profile` always stored mon children as a **bare pane list**.
Bare mon bodies desugar with default **`split: "hsplit"`**. Mon-level
`layout: "VSPLIT"` was never written. Nested `{ "vsplit": […] }` panes (VSPLIT
**CON** under mon) already round-tripped.

## Fix

1. **Save:** mon `VSPLIT` + ≥2 panes → `{ "vsplit": panes }` (`layout_save.py`).
2. **Output:** single-mon mon-level h/vsplit uses mon map
   `{"tiles": {"mon0": {vsplit:…}}}` so `mon0.split` is not lost as nested-only.
   Dual-mon bare `[{vsplit:…}, mon1Body]` + live `mon_count` keeps mon-level split.
3. **Tests:** capture, validate, plan after close nautilus → `ensure_layout` vsplit.
4. **Docs:** one line in `docs/user/layout.md` (bare list = hsplit; mon VSPLIT tagged).

## Acceptance

1. [x] Forest mon0 `layout=VSPLIT` with two window children → tagged vsplit sugar.
2. [x] `validate_reconcile_profile` → mon0 `split == "vsplit"`.
3. [x] Plan after closing nautilus → `ensure_layout` mode `vsplit`.
4. [x] Dual-mon bare HSPLIT (tree-perfect) unchanged.
5. [x] `test_layout_save.py` + `test_layout_plan.py` — 194 passed.

## Session note

**A/B AGREE (2026-07-29):** implement + verify on `plan/forge-layout-reliability`.
Unit green; live re-verify on black optional (save `t1` with mon VSPLIT, close
companion, `forge layout t1` → below not side-by-side).
