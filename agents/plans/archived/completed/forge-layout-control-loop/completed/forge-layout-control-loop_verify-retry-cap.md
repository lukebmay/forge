# Task: verify-retry-cap + layout order + tab slot reassert

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-control-loop](../forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-06  

## Goals

### A. Control-loop settle (user lock)

| Rule | Detail |
| --- | --- |
| **SETTLED** | **2** consecutive **time-delayed** full-agreement verifies (already `agreementNeeded=2` + debounce) |
| **Mismatch** | `agreementCount = 0`; not settled |
| **Retry** | On mismatch, request layout re-apply — **not** once-and-done latch |
| **Cap** | After **10** total mismatch verify fires in a wave, **stop** requesting layout; `Logger.error` with debug (mismatch sample, checked, reasons, layout request count) |
| **Reset wave** | Successful SETTLED and/or `markUnsettled` start a fresh mismatch budget |

### B. `forge layout` mon order after place (Wayland residual)

Planner currently: `ensure* → order → size → place/move → focus`.  
`ensure_order` mon1 with Ghostty+YouTube runs **before** move YouTube→mon1 →  
`mon-directs not under same MONITOR` → follow-up aborts; apps stuck mon0.

**Fix:** place/move/open actions **before** `ensure_order` / `ensure_sizes`.  
Optional soft-skip order when mon-directs not co-located (no hard stop of whole chunk).

### C. Tab/stack focus geometry (from prior smoke)

On TABBED/STACKED focus (and tab click path): re-`move` any sibling TILE whose Meta frame is off `renderRect`/`rect` (ε), then raise focused. **No** full `renderTree("focus")`.

## Acceptance

1. Unit: 2 clean verifies → SETTLED; mismatch resets; up to 10 layout-on-mismatch then give-up + error path testable.
2. Unit/plan: action order place before mon order (or pytest for plan_reconcile).
3. Unit: focus/tab path reasserts off-slot tab siblings without full focus render.
4. Vitest (+ pytest if plan touched) green for touched suites.

## Session note

**2026-08-06 A/B AGREE:**

- **A:** `LAYOUT_VERIFY_MISMATCH_MAX=10`; each mismatch re-`requestLayout` until cap; then `Logger.error` + `_mismatchGiveUp`. Agreement / `markUnsettled` reset budget. SETTLED still 2 clean delayed verifies.
- **B:** mon-directs soft-skip; plan place before `ensure_order`/`ensure_sizes`.
- **C:** tab/stack sibling slot reassert on focus (no full focus render).
- Vitest 83 + pytest TestMonOrder green (B re-ran).
