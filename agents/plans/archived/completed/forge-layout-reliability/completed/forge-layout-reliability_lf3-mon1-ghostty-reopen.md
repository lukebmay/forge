# forge-layout-reliability_lf3-mon1-ghostty-reopen

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

After closing **left chrome** and **right Ghostty**, `forge layout dev` must
restore one Ghostty per monitor (mon0 keeps existing; mon1 gets opened/moved),
not two Ghosttys on mon0.

## Live repro (black, 2026-07-29)

1. Usual host `dev` layout.
2. Close **left google-chrome**.
3. Close **right Ghostty**.
4. `forge layout dev`

**Observed:** Tab groups + active look good; **two Ghosttys on left**; none on right.

## Hypotheses (investigate)

1. **PlaceNext class exact-match:** Ghostty open has no `wmClass`; hints may be
   stem `ghostty` while Meta is `com.mitchellh.ghostty` → PlaceNext no-op → lands
   mon0 LFT after chrome open.
2. **Residual abort before move:** residual replan still `open`s chrome (title lag
   / pin miss) and apply **returns before** residual_ext move of mon1 Ghostty.
3. **Move Meta mon:** tree reparent without lasting `move_to_monitor` (less likely
   if residual never runs).

## Acceptance

- [x] Plan1: mon0.ghostty **reused**, mon1.ghostty-2 **open** (not steal mon0 term).
- [x] Residual: wrong-mon mon1 Ghostty → **move** to mon1; mon0 keeps one Ghostty.
- [x] PlaceNext class match accepts reverse-DNS stem (`ghostty` ↔ `com.mitchellh.ghostty`).
- [x] Residual extension steps (moves/layout) **run even if** some roles still open
      (warn/fail after, not skip mon fix).
- [x] Unit tests for this forest shape + residual apply behavior.
- [x] Existing CLI/regression tests stay green.

## Non-goals

- LF2 tab click (done).
- STACKED polish.

## Session note

**2026-07-29 Task Force A — implement**

**Root cause (two cooperating bugs):**

1. **PlaceNext `wmClassEqual`** was exact casefold only. Sugar match class `ghostty`
   (and open.wmClass after harden) does not equal Meta `com.mitchellh.ghostty` →
   PlaceNext no-op → new Ghostty lands mon0 LFT after chrome. (Ghostty
   `--gtk-single-instance` can also prefer existing mon0 instance.)
2. **Residual apply aborted** on `residual_open` before moves — chrome title lag /
   pin miss left mon1 Ghostty stuck on mon0 even when residual plan said `move`.

**Shipped:**

| Area | Change |
| --- | --- |
| `lib/extension/place-hint.js` | `wmClassEqual` reverse-DNS stem (mirror layout_plan) |
| `scripts/forge/forge` | residual: run follow-up moves first; fail after on still-open; `_class_eq` stem for wait |
| `scripts/forge/layout_apply.py` | `residual_follow_up()` pure helper |
| `scripts/forge/layout_plan.py` | copy `match.class` → `open.wmClass` when open lacks class |

**Tests:** `TestPartialReopenLF3`, residual_follow_up apply test, place-hint stem tests.
`pytest tests/unit/cli/ -q` → 292 passed; place-hint vitest 19 passed.

**Branch:** `plan/forge-layout-reliability` — no commit (parent wraps after B).

### Verifier (Task Force B) — 2026-07-29

**VERDICT: AGREE**

Reviewed uncommitted LF3 diff on `plan/forge-layout-reliability` (place-hint,
forge residual control flow, residual_follow_up, match.class → open.wmClass,
LF3 plan/apply/place-hint tests).

| Acceptance | Result |
| --- | --- |
| Plan1 mon0 ghostty reuse + mon1 open | Covered by `TestPartialReopenLF3.test_plan1_*`; synthetic dry-run OK |
| Residual wrong-mon → move mon1 | `test_residual_two_ghosttys_*` + without-chrome-pin; steps include `id:501` → mon1 |
| PlaceNext reverse-DNS stem | `wmClassEqual` + vitest; live path via `consumePlaceHint` in `window.js` |
| Residual ext runs despite residual opens | forge: follow-up first, fail after; helper pure + unit tested |
| Unit tests green | pytest CLI 292; place-hint vitest 19 |

**Skeptical checks:** stem false positives (`tty`/`chrome` short stems) OK; open.wmClass
fill narrows wait to one class but stem eq covers Meta reverse-DNS; residual
control flow linear and correct.

**Risks (non-blocking):** live Ghostty single-instance may fail open (no new
windowId) before residual; needs install/HUP live drive. No integration test of
forge residual path beyond pure helper (logic is short).
