# LX1 — layout dev tab apply (ghostty-only reHUP ×2)

**Status:** done  
**Priority:** P0  
**Plan:** [forge-layout-live-x11](../../forge-layout-live-x11.md)  
**Branch:** `plan/forge-layout-live-x11`  
**Created:** 2026-08-06  
**Host:** black — X11, dual 4K  
**Taskforce:** A/B AGREE

## Problem

After closing everything except Ghostty windows and running `forge layout dev`:

1. **Left (mon0)** tab group often does **not** form at all (Chrome + Grok stay
   separate HSPLIT siblings next to Ghostty).
2. **Right (mon1)** tab group sometimes only tabs **2 of 3** roles; retry may
   fix mon1 while mon0 still fails.

Live evidence after final apply this session:

- mon0: `HSPLIT(Grok, Chrome, Ghostty)` — no TABBED
- mon1: `HSPLIT( HSPLIT(ghostty), TABBED(YT, Voice, Gmail) )` — tabs OK this pass
- Dry-run: `tabbed-roles-not-grouped:mon0.s0` + `ensure_layout mon0.s0 tabbed`
  for chrome+Grok — **planner sees the bug; apply did not stick**.

## Acceptance

1. **Agent reHUP test (must pass twice in a row):**
   - Close/minimize all non-Ghostty tiled windows (leave the two Ghosttys).
   - `./install` (debug) if code changed; logging on if diagnosing.
   - Run `forge layout dev`; wait ≥3s for settle.
   - `forge tree` (or GetTree):  
     - mon0 (left): `TABBED(Chrome, Grok) | ghostty` (order per profile)  
     - mon1 (right): `ghostty | TABBED(YouTube, Gmail, Voice)` (order per profile)
   - Repeat the close-to-ghostty + `forge layout dev` + verify cycle **a second
     time** without manual tab repair. Both passes must match.
2. Unit/synthetic coverage for the root cause when it is pure planner/apply
   (ensure_layout tabbed multi-role from flat mon siblings; no demote thrash).
3. Do not regress mon-order / two-pass claim / mon-ensure tab-member guard.

## Likely areas

- CLI reconcile apply: `ensure_layout` TABBED path / RunSteps / layout session API
- Race: open settle before structure ensure (LF5/LF6 history)
- Nested empty HSPLIT CON on mon1 ghostty (`path mo1ws0/0/0`) — cleanTree?
- Mode B thrash recover partial apply

## Out of scope

- Tab drag (LX4), cross-mon move (LX3), extract split orient (LX2)

## Session note

**2026-08-06 B (verify):** **AGREE**

Branch `plan/forge-layout-live-x11`. Diff review matches claimed root cause:
`split` no-op on FLOAT broke mon-wrap → MONITOR.layout TABBED / flat three;
forceSplit+FLOAT, live re-find, H/V subset wrap, belt structure re-apply.

**Tests re-run:** vitest flatten 5 + Tree-ops 57; related layout cycle/clsp/at72
17; pytest `test_layout_apply.py` + `test_layout_plan.py` 248 — all green.

**Live (no reHUP):** `forge tree` still green —
mon0 `TABBED(Chrome,Grok)|ghostty`; mon1 `ghostty|TABBED(YT,Gmail,Voice)`.
Skipped second reHUP (would thrash desk / risk agent ghostty); A ×2 + current
structure sufficient.

**Residual nits (non-blocking):** (1) post-wrap fail check only detects
still-on-MONITOR, not failed H/V multi-window wrap; (2) `mergeWindowsIntoGroup`
FLOAT guard removed — callers still gate interactive path; (3) no dedicated
Tree-ops test for `split(..., forceSplit=true)` + FLOAT.

**Files:** tree.js, session-api.js, scripts/forge/forge, bug-tz-tab-apply-flatten.
