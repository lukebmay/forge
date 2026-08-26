# forge-layout-reliability_lf6-open-then-stable-rehome

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

Layout apply phase order when roles need open:

1. **Open all** missing apps (launch + wait appear / pin windowId).
2. **Wait** until every new window is present.
3. **Wait until the entire GetTree is stable** (no thrash / Ghostty self-move).
4. **Then** rehome: one residual plan + apply **all** moves/layout/order/focus.

Do **not** interleave residual Move with still-churning opens (LF5 per-window settle was not enough live; Ghostty may re-place itself).

## Product rule (user)

> open all the apps, wait for them to appear, and then wait until the entire  
> tree is stable, then rehome everything.

## Acceptance

- [x] After opens, apply does **not** residual-move until `tree_is_stable` (fingerprint stable for N samples).
- [x] Pure helpers: forest fingerprint + stability wait (unit-tested).
- [x] One rehome pass after stable (moves + ensure + order + focus); optional single belt after second stable if still wrong mon.
- [x] Existing open/pin/ghostty multi-instance behavior preserved.
- [x] CLI unit tests green.
- [x] Session notes. No Shell kill; no closing user windows casually.

## Non-goals

- OP2 dock (done).
- Install session (SI1).

## Session note (2026-07-29 Task Force A)

### Root cause

LF5 waited per-window **TILE** before residual Move, but Ghostty/Meta can still
**rehome after TILE**. Residual replan + Move ran while the forest fingerprint
was still thrashing → wrong mon / thrash.

### Fingerprint (`forest_stability_fingerprint`)

Sorted lines over GetTree:

- **W** — every WINDOW: `windowId`, `mode`, `monitor`, tree `path`
- **C** — CON/MONITOR with layout and/or `lastTabFocusId` (or lastTabFocus→id)

### Apply order (`_layout_run_reconcile`)

1. Plan1 ext steps (already-present only)
2. Open all + role_pins
3. `wait_for_tree_stable` (~7s / 180ms / 3 samples)
4. Re-plan with pins → residual batch (LF5 settle usually no-op)
5. Optional belt: short stable wait + move just_opened wrong mon

### Shipped

| Path | Change |
| --- | --- |
| `scripts/forge/layout_apply.py` | `forest_stability_fingerprint`, `wait_for_tree_stable`, constants |
| `scripts/forge/forge` | residual after tree-stable; belt second stable |
| `tests/unit/cli/test_layout_apply.py` | `TestForestStabilityLf6` |
| `docs/DESIGN.md` | open-then-stable-rehome |

### Tests

`pytest tests/unit/cli/ -q` (see handoff)

### Risks for B

- Belt always re-plans after residual even when perfect (extra GetTree; cheap).
- Timeout proceeds with residual anyway (same as LF5 settle timeout).
- Fingerprint ignores rect size / percent (intentional — mon/path/mode thrash).

**Branch:** `plan/forge-layout-reliability` · no commit (parent after B)

## Verifier (Task Force B — 2026-07-29)

**Verdict: AGREE**

### Control flow (`_layout_run_reconcile`)

1. Plan1 `ext_steps` — already-present only (before any open).
2. Open loop (`do_launch` + `role_pins`) — **no** residual Move/replan mid-open.
3. `if open_actions:` → `wait_for_tree_stable` → replan with pins →
   `residual_follow_up` → optional LF5 per-id settle (post-stable) → residual batch.
4. Belt: second `wait_for_tree_stable` then move-only for just_opened wrong mon.

Residual rehome is gated on opens + whole-tree stable. No interleave with open churn.

### Fingerprint

- **W:** `windowId|mode|mon|path` — path encodes sibling order / reparent.
- **C:** layout + lastTabFocusId/lastTabFocus + mon id when present.
- Spot-checked: mon move, mode, focus, layout, reorder, reparent all change fp;
  percent intentionally ignored (matches A/DESIGN).
- GetTree (`tree-query.js`) supplies int `monitor` + `lastTabFocusId` — fp fields align.

### Tests

`pytest tests/unit/cli/ -q` → **314 passed** (0.44s).

### Risks (non-blocking)

1. Stable timeout still proceeds residual (documented; same class as LF5).
2. Belt always re-plans after residual when pins present (extra GetTree; cheap).
3. ~3 samples × 180ms can declare stable during a quiet gap before late
   Ghostty self-move; belt second stable is the safety net.
4. Order integration is docstring-only (`test_open_then_stable_rehome_order_doc`);
   forge wire-up verified by code review, not a control-flow unit test.
5. Defensive: if `monitor` were ever a non-int string while `cur_mon` is set,
   mon would prefer `cur_mon` over parsing the string — not live GetTree shape.

No tiny fixes required. Live re-verify still on human for dual-mon Ghostty thrash.
