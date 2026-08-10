# forge-lifecycle-abstractions_a2-settle-math — L6 settle-math kernel + golden parity

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../plans/forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** A1 SourceBag done; D0 lock (L6 = second pure slice)

## Goal

Implement **L6 settle-math kernel**: one pure shared formula for rolling residual
timeouts — `max(last N) * pad`, floored and clamped — with **JS ↔ CLI golden
parity**. Product layers stay separate (thrash catalog vs CLI heuristics session).

**Lens:** health = one pure home + tests; not “merge thrash into CLI” or shrink files.

## Scope (do)

| Item | Detail |
| --- | --- |
| JS pure module | e.g. `lib/extension/settle-math.js` (or `lib/shared/` if cleaner) — no GObject/GLib |
| Python pure | Same formula in CLI; either thin pure helpers in `settle_heuristics.py` or a small sibling module that `soft_timeout_ms` calls |
| Constants aligned | `ROLLING_N = 10`, `PAD = 1.25` (already both sides); document floors/clamps remain **caller-owned** residual-kind policy |
| Call sites | `soft_timeout_ms` (CLI) and rolling path of `computeLearnedMinQuietMs` / thrash catalog use the kernel |
| Unit tests | JS vitest + Python unittest |
| Golden parity | Same numeric rows in both suites (or one golden table both load) |

## Non-goals (do not)

- Merge AppThrashCatalog product API with HeuristicsSession / file store
- Wayland RC, nest, layout product spine
- SignalBag (L2) — next task after this
- utils.js split
- Rewriting thrash catalog façade beyond calling the kernel

## Formula contract (shared kernel)

For a list of residual-positive latencies (ms), optional overrides:

1. Take last **N** non-negative finite samples (`N` default 10; invalid entries skipped).
2. If no samples after filter: return **floor** (caller policy; not first-ever).
3. Else: `raw = max(samples) * pad` (`pad` default 1.25).
4. Return `min(clamp, max(floor, raw))` as int ms.

**Out of kernel (product still owns):**

- First-ever / `trialCount == 0` → learning trial cap (`learning_trial_soft_cap_ms`)
- Residual-kind default floors/clamps (`soft_floor_ms` / `soft_clamp_ms`)
- Single-sample raise-only path when thrash has no `latenciesMs` array
- File I/O, keys, host/class

CLI `soft_timeout_ms` after first-ever branch: residual list → **kernel**.  
JS `computeLearnedMinQuietMs` when `latenciesMs` present: → **kernel** (`seedFloor` = floor, `cap` = clamp).

## Acceptance

- [x] Pure JS settle-math module exported + documented one-liner purpose
- [x] CLI `soft_timeout_ms` (non-first-ever path) uses shared formula helpers
- [x] Thrash rolling minQuiet path uses JS kernel (no duplicated max*pad math)
- [x] JS unit tests cover: empty, single, rolling N trim, pad, floor, clamp, bad inputs
- [x] Python unit tests cover same formula cases (existing SoftTimeoutMath stays green)
- [x] **Golden parity:** ≥6 shared cases where JS and Python return identical ints
- [x] Existing suites green: thrash catalog, settle_heuristics, layout_apply soft if touched
- [x] No Wayland / nest / live required for this slice

## Context for the next agent

- **Shipped L6:** pure settle-math kernel + golden parity JS↔CLI.
- **JS:** `/home/luke/dev/me/forge/lib/extension/settle-math.js` — `ROLLING_N`, `PAD`, `lastRollingLatencies`, `softTimeoutFromLatencies` (no GObject/GLib).
- **Python:** `/home/luke/dev/me/forge/scripts/forge/settle_heuristics.py` — `last_rolling_latencies`, `soft_timeout_from_latencies`, `_latency_int`; `soft_timeout_ms` residual path → kernel; first-ever + residual-kind floors/clamps still product-owned.
- **Wire:** `app-thrash-catalog.js` re-exports `SETTLE_LEARN_PAD`/`SETTLE_ROLLING_N` from kernel; `computeLearnedMinQuietMs` uses kernel when `latenciesMs` is an array (`seedFloor`=floor, `cap`=clamp); single-sample raise-only when array absent.
- **Tests:** `tests/unit/extension/settle-math.test.js`, golden mirrored in `SoftTimeoutKernel` in `tests/unit/cli/test_settle_heuristics.py`; thrash + layout-controller expectations use `Math.trunc`.
- **Next pure:** L2 SignalBag (plan order). Do not merge thrash catalog with CLI session.
- **Risks:** minQuiet is now int ms (trunc); fractional pad products (e.g. 50×1.25→62) differ from old float JS. Empty `latenciesMs: []` uses kernel floor (ignores previous raise-only).

## Session note

- **2026-08-10 implementer A:** L6 settle-math done.
- **Files:** `lib/extension/settle-math.js` (new); `lib/extension/app-thrash-catalog.js`; `scripts/forge/settle_heuristics.py`; `tests/unit/extension/settle-math.test.js` (new); `tests/unit/extension/app-thrash-catalog.test.js`; `tests/unit/extension/layout-controller.test.js`; `tests/unit/cli/test_settle_heuristics.py`.
- **API:** `lastRollingLatencies`/`last_rolling_latencies` (last N non-neg finite ints); `softTimeoutFromLatencies`/`soft_timeout_from_latencies` → empty→floor else `int(min(clamp,max(floor,max*pad)))` with `Math.trunc`/`int` parity.
- **Tests run:**
  - `npx vitest run tests/unit/extension/settle-math.test.js tests/unit/extension/app-thrash-catalog.test.js` → **49 passed**
  - plus layout-controller + layout-open → **111 passed** (4 files)
  - `python3 -m pytest tests/unit/cli/test_settle_heuristics.py -q` → **29 passed**
- **Golden:** 8 shared rows (empty, floor, pad, clamp, rolling window, trunc 62.5→62, bad inputs).
- **Residual risks:** callers that compared float minQuiet without trunc; bool latencies rejected in Python filter now.
- **Status:** ready for verify. Next plan pure = SignalBag.

- **2026-08-10 verify B:** **PASS** — L6 done for handoff. No code fixes.
- **Formula:** empty→floor; else `Math.trunc`/`int(min(clamp, max(floor, max*pad)))` (not round). `ROLLING_N=10`, `PAD=1.25`. Floors/clamps/first-ever/single-sample raise-only remain product-owned.
- **Wire:** CLI `soft_timeout_ms` residual → `soft_timeout_from_latencies`; thrash `computeLearnedMinQuietMs` array path → `lastRollingLatencies` + `softTimeoutFromLatencies` (no leftover rolling max*pad in catalog). Product APIs still separate (`AppThrashCatalog` vs `HeuristicsSession`).
- **Golden spot-check (manual):** empty→400; [800]→1000; rolling last-10 max 400→500; [50]→62 trunc; clamp 10000→3000 — match both suites.
- **Tests re-run:**
  - vitest settle-math + thrash + layout-controller + layout-open → **111 passed** (4 files)
  - `pytest tests/unit/cli/test_settle_heuristics.py -q` → **29 passed**
- **Residue:** no debug prints / temp files; comments short why-only.
- **Residual risks (unchanged):** float minQuiet callers; JS may accept bool `true` as 1 while Python `_latency_int` rejects bools; empty `latenciesMs: []` uses kernel floor (not raise-only).
- **Next:** L2 SignalBag (do not start here).
