# forge-tab-click-unresponsive — TABBED strip clicks often do nothing (R032)

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-15

## Goal

When a TABBED (or STACKED) group is present, clicking a tab in the strip
must reliably reveal/focus that child. Clicks must not silently no-op until
the user clicks something outside the strip (or the window body) first.

## Acceptance

- [x] Repro documented (layout + which group + what was focused before the
      dead click)
- [x] Root cause known (hit-test / decoration stack / event sink / focus
      ownership — not a guess)
- [x] Fix uses existing tab contracts (`revealGroupChild`, open-leaf /
      `lastTabFocus`, decoration layout) — no parallel click path
- [x] L0 guard that fails without the fix
- [x] Nest live: after ApplyLayout, strip pick hits tabs; repeated
      `_activateFromTab` switches open leaf without a non-group or
      window-body click first. Host tip needs logout (Wayland).

## Context for the next agent (complete + succinct)

- **Repro:** After ApplyLayout, TABBED group present. Keyboard focus is
  often on a group child (or pin restore after late steal). First strip
  click no-ops until the user clicks a non-group tile or the window
  body (those run `afterFocus` / Dfocus and restack chrome). Host daily
  desk: mon0 Chrome+Grok TABBED (strip y=36–71, tree content y=71).
- **Root:** last raise after ApplyLayout leaves decoration actors
  **under** window actors. Chrome CSD / stale Meta frames often still
  cover the strip rect, so pick hits the window (not the tab). Distinct
  from R025 (wrong size) and R026 (pin snap-back). Apply scrim (R027)
  is destroyed on clear — not this bug.
- **Two holes that kept the strip buried:**
  1. ApplyLayout dropped WR14 `_scheduleRunStepsSettle`. Product last
     raise (focus / soft pin / verify / belt) never restacked chrome.
  2. `_activateFromTab` called `focus()` *after* `revealGroupChild`
     restack, re-burying chrome. A Done-path `settleTabFocus` raise
     does the same on Wayland (compositor applies raise after the
     restack idle).
- **Fix:** WR14 settle still on ApplyLayout **steps** (F+D after
  structure). ApplyLayout **Done** calls `_restackTabDecorations` only
  (no second raise). Keyboard `revealGroupChild` does focus+activate
  then `afterFocus` (restack last). Settle/restack unfreeze so a live
  `_freezeRender` cannot skip chrome.
- **Not:** new click handler; personal layout branches.

```bash
npm test -- tests/regression/bug-tab-click-activate.test.js \
  tests/unit/extension/action-pipeline.test.js \
  tests/unit/extension/geom-open-runsteps.test.js
python3 -m pytest tests/unit/cli/test_live_matrix.py -q
# Nest (XAUTHORITY = live /run/user/1000/.mutter-Xwaylandauth.* if :1 fails):
./install --kit=vim
XAUTHORITY=/run/user/1000/.mutter-Xwaylandauth.* forge nested start --replace
# then ApplyLayout a TABBED _forge-test-* desk; strip pick + reveal
forge nested stop
forge nested status   # running: False
```

## Session note

**2026-08-15 — R032 done.**

| Field | Detail |
| --- | --- |
| Root | ApplyLayout skipped WR14 restack; trailing/`settleTabFocus` raise re-buried strip under overlapping window actors |
| Fix | Steps still WR14 settle; **Done restack-only**; reveal focus+activate then afterFocus; unfreeze settle |
| L0 | `bug-tab-click-activate` 12; `action-pipeline` 26; `geom-open-runsteps` 8; live_matrix R032 catalog |
| Nest | tip after `./install --kit=vim`; 2 zenity TILE → TABBED → `layout _forge-test-r032` (deleted after); after apply pick hitTab; repeated `_activateFromTab` LTF switch **PASS**; chrome-clear; no XTEST (crashed nest) |
| Host | Wayland; tip still `g1213cb7` until logout — no host pointer smoke |
| Nest stopped | `running: False` |
