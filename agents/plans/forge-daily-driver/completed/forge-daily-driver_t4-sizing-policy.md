# Task — T4: Sizing policy (equal until user resize)

**Status:** In progress  
**Plan:** [forge-daily-driver.md](../plans/forge-daily-driver.md)  
**Analysis:** [forge-layout-thrash-analysis.md](../plans/forge-layout-thrash-analysis.md) § Q2 sizing  
**Priority:** P2  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-daily-driver/completed/`

## Problem

Tile sizes are under-documented and surprising:

1. Magic `percent = 0` means “equal” in `computeSizes`.
2. `insertChildPercent` (forge-7m3) preserves ratios whenever any sibling has a
   non-zero percent — including percents that only exist from layout/normalize,
   not user intent.
3. Min-size redistribution (forge-s6g) can **paint** unequal frames while stored
   percents still claim equal/other values.
4. No clear “user set this size” marker; equalize-on-insert vs preserve is implicit.

Product lock: **equal share until the user resizes**; optional setting to
re-equalize vs preserve when adding a window after a user resize. Not a flex
engine rewrite.

## Goals

1. **`userSized` flag** on nodes — set only on explicit user size intent
   (mouse resize, keyboard expand/shrink/edge resize, golden ratio).
2. **Equalize on insert** when no sibling is `userSized` (ignore non-zero
   “automatic” percents).
3. **Setting** `new-window-size-policy`: `preserve` (default, forge-7m3 when
   user-sized) | `equalize` (re-equalize whole parent on new window).
4. **Write back** effective percents after min-size redistribution (do not set
   `userSized`).
5. **`resetSiblingPercent` / Super+=** clears percents **and** `userSized`.
6. Document Super+= equalize + policy in user docs; unit/regression tests.
7. Overlay: distinguish user % vs auto/effective (optional small tweak).

## Code touch list

| Area | Notes |
| --- | --- |
| `lib/extension/tree.js` | `Node.userSized`; `insertChildPercent` policy; write-back in `computeSizes`; `resetSiblingPercent` clears flag |
| `lib/extension/window.js` | mark `userSized` on resize / expand / golden paths |
| Schema + config-sync + prefs | `new-window-size-policy` string |
| `layout-debug-overlay.js` | show user vs auto/% |
| Docs | `docs/user/layouts.md`, keybindings; short DESIGN note |
| Tests | insert policy; min write-back; flag mark/clear |

## Acceptance

- [ ] New windows re-equalize siblings until any sibling is user-sized
- [ ] After user resize / golden / expand, insert preserves ratios when policy=`preserve`
- [ ] Policy=`equalize` re-equalizes even after user resize
- [ ] Min-size path writes effective percents without marking user-sized
- [ ] Super+= (`window-reset-sizes`) clears user sizing intent
- [ ] Unit tests pass; `npm test` green
- [ ] No full flex engine / pin-to-tile

## Out of scope

- Full flexbox engine / `basis` px+% hybrid (mid-term in analysis)
- Pin-to-tile constraints
- Live mouse-resize polling port
- T5 keybind redesign

## Session note

_(overwrite each session)_
