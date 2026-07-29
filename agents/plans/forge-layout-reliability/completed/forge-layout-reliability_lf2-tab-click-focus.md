# forge-layout-reliability_lf2-tab-click-focus

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

Tab strip clicks always focus/raise the target window without a prior dock or
content click.

## Symptom

Sometimes a tab click does nothing useful for focus; operator must click the
app's **dock item** first, after which tab focus works again.

## Scope

- `_activateFromTab` / tab button handlers (`tree.js`)
- `updateTabbedFocus` / decoration restack (`focus.js`, processNode)
- Post-layout / RunSteps settle (WR14) leaving chrome unpickable or windows buried
- Multi-mon focus: focus on other mon, then click tab

## Non-goals

- LF1 mon/open/active (separate task).
- Redesign of tab chrome visuals.

## Acceptance

- [x] Primary-click on tab activates + focuses that leaf without dock priming.
- [x] Root cause written in session note (stacking, race, frozen render, etc.).
- [x] Regression coverage where feasible (unit/e2e); else minimal reliable repro notes.
- [x] `docs/user/troubleshooting.md` only if user-facing steps change. *(unchanged — fix is internal)*

## Session note

**Root cause (two holes after prior restack work):**

1. `_activateFromTab` did `raise` + `activate` only. Keyboard `_activateWindowNode`
   does `raise` → **`focus`** → `activate`. On X11, activate-only often fails to
   take desk focus after multi-mon focus / layout apply until dock primes via
   Shell's full path.
2. Tab path never called `updateDecorationLayout` after raise. Raise buries the
   strip under the window actor; deferred focus-update (~220ms) **skips when
   focus did not change**, so chrome stayed unpickable. Hover re-raised the
   already-focused window every ~16ms and re-buried chrome.

**Fix:**

- `tree.js` `_activateFromTab`: focus+activate; unfreeze; tab/stack update;
  **immediate** decoration/border restack.
- `focus.js` hover: only focus/raise when under-pointer ≠ current focus;
  resolve focus via `get_focus_window()`.

**Tests:** `bug-tab-click-activate` (+ LF2 cases); 1228 regression/unit green.

**Files:** `lib/extension/tree.js`, `lib/extension/focus.js`,
`tests/regression/bug-tab-click-activate.test.js`, `docs/DESIGN.md`.

### Verifier (Task Force B)

**Verdict: AGREE** (after one-liner B fix)

Reviewed uncommitted LF2 diff on `plan/forge-layout-reliability`.

- Root cause writeup matches code: tab path was activate-only vs keyboard
  raise→focus→activate; no chrome restack after raise; hover re-raise every 16ms.
- `_activateFromTab` order: raise → focus → activate, then unfreeze → tab/stack
  update → `updateDecorationLayout` / `updateBorderLayout` (decoration after raise
  so strip ends above group actors). Matches focus-update settle path.
- Stacked path still raise-only for labels (no appendChild reorder).
- Hover skip when under-pointer === focus is correct; prevents re-bury.
- Tests: focus+activate spies, freeze unfreeze, chrome z-order after raise,
  hover no-op / cross-window raise.
- `troubleshooting.md` correctly untouched.

**B fix (one-liner):** A preferred `get_focus_window()` only, which broke #483
dialog guards in `FocusManager.test.js` (tests set `display.focus_window`).
Coalesce: `get_focus_window() ?? focus_window` in `focus.js`.

**Tests re-run (all green):**
`bug-tab-click-activate` (9), `bug-d5mm-focus-restack` (3),
`FocusManager` (11), `WindowManager-focus` (25), `WindowManager-pointer` (11)
→ 59/59.

**Residual risks (non-blocking):** permanent unfreeze on tab click during a
RunSteps freeze; hover *focus change* still raises without immediate deco
restack (deferred focus-update ~220ms covers that path). Live X11 multi-mon
not re-proved in unit suite.
