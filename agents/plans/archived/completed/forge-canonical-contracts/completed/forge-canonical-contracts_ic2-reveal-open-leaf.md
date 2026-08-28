# forge-canonical-contracts_ic2-reveal-open-leaf — One show-in-group API

**Status:** done
**Plan:** [forge-canonical-contracts](../forge-canonical-contracts.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

One WM primitive for “make this child the visible leaf of its TABBED/STACKED
group.” Convert live one-off `lastTabFocus` + `raise` writers.

## Acceptance

- [x] `wm.revealGroupChild(node, { keyboard, pin })` implemented (pipeline
      + WM delegate). Writes LTF, optional pin, raise,
      `settleTabFocus`; keyboard → activate + `afterFocus`
- [x] `_focusOp` becomes a thin caller
- [x] Live writers converted: `command.js` layout toggles / merge settle,
      `tree._activateFromTab`, session restore raise walk
- [x] Snapshot persist (`session-layout`, `tree-snapshot`) may still write
      LTF as **data** — not required to reveal
- [x] GetTree still must **not** sync LTF from Meta focus (R014)
- [x] Units: pin + keyboard false does not activate; tab-active CSS follows
      LTF; existing focus pipeline tests stay green

## Context for the next agent

- API: `lib/extension/action-pipeline.js` `revealGroupChild` +
  `WindowManager.revealGroupChild`. Optional `source` only for afterFocus.
- `_focusOp` → `reveal({ keyboard, pin: opts.pin !== false, source: "dbus-focus" })`.
- F helpers still adopt the argument (`updateTabbedFocus` / `updateStackedFocus`).
- D018 / D025. Catalog: `docs/dev/contracts.md` § Open leaf.
- Do not invent a mega `raiseWindow()`.
- IC4 not started.

## Session note

**2026-08-13 implement (orchestrator review).** D025 `revealGroupChild` on
master. No commit/push. IC1/IC3 left in tree.

**API**
```
wm.revealGroupChild(node, { keyboard = false, pin = false, source? })
  write LTF (if parent isStackedOrTabbed) → optional pin → raise
  → settleTabFocus (F+Dfocus+B)
  → if keyboard: activate + afterFocus
```
Activate errors throw (thin `_focusOp` maps them). Pin restore uses
reveal (pin already set). No mega `raiseWindow()`.

**Converted**
- `session-api._focusOp` — thin caller; pin default true
- `tree._activateFromTab` — reveal `{ keyboard: true, source: "tab-click" }`
  + extra `focus()` (LF2)
- `command.js` LayoutTabbedToggle enter; LayoutStackedToggle /
  LayoutStackTabToggle lastChild; WindowMergeGroup post-commit
- `session-api._mergeGroupOp` non-quiet post-commit
- `restoreLayoutOpenLeafIfStolen` — reveal pin node
- Wave 2: `raiseAfterSessionRestore` DFS raise-all kept; open leaf via
  reveal. `_scheduleSessionFocus` reveal then LFT. Keyboard-last +
  `syncLastTabFocusFromFocus` kept (SI1 stale-LTF vs focusMeta).

**Left as data (ambiguous / persist)**
- `session-layout` / `tree-snapshot` LTF persist
- `session-api._layoutOp` / `_layoutCycleOp` LTF (re-affirm preserve;
  quiet RunSteps settle)
- `mergeWindowsIntoGroup` applyGroupLayout LTF (structure data)
- `window.js` tiny-pane TABBED wrap LTF
- No live STACKED merge caller activates lastChild (merge-group is TABBED)

**GetTree** — still no LTF sync from Meta focus (R014). Unit added.

**Proven**
```
npm test -- tests/unit/window/WindowManager-focus.test.js \
  tests/regression/bug-tab-click-activate.test.js \
  tests/unit/extension/layout-open-leaf-pin.test.js \
  tests/unit/extension/action-pipeline.test.js \
  tests/unit/command/CommandHandler.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js \
  tests/unit/extension/session-layout.test.js \
  tests/unit/window/WindowManager-borders.test.js \
  tests/unit/extension/geom-open-runsteps.test.js \
  tests/unit/extension/structure-one-commit.test.js \
  tests/unit/extension/DecorationManager.test.js
```
242 green.

**Leftover:** live desk smoke not run. IC4 not started.
