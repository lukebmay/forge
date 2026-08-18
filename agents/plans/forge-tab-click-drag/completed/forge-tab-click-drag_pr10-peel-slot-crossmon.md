# forge-tab-click-drag_pr10-peel-slot-crossmon — Peel MOVE APP slot place + cross-mon

**Status:** done
**Plan:** [forge-tab-click-drag](../../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Priority:** **P0** (product broken; blocks tab relocate)
**Depends:** PR9 spacer-only + peel AABB (kept). Serial before PR11 (shared `drag-drop.js`).
**Agent:** Grok **4.5** · implement

## Goal

1. **Peel → place like a titlebar window.** Leave-strip MOVE APP must
   enter grab-tile, paint drop-zone overlay, and **commit** edge /
   CENTER / empty-mon / wrap-in-slot the same as a normal TILE titlebar
   grab. Operator report: still cannot place a peeled tab into slots.
2. **Cross-monitor tab drag.** Dragging a tab toward another monitor
   (foreign strip and/or empty/other mon tile zones) must work without
   freeze and must commit (D044 rehome-then-join for foreign group;
   existing empty-mon / zone drop otherwise). Operator: still broken
   after PR9.

## Operator reports (2026-08-17 host, after PR8/PR9 tip)

2. Cross monitor dragging tabs still broken.
3. Still cannot place tab like a window in slots.

(Issue 1 = mid-drag gap equalize → **PR11**, do not fold here unless
trivial one-liner with zero risk to peel.)

## Acceptance

- [x] Peel (pointer leaves origin strip band after REORDER or past
      threshold off-band) → `_startTabMoveGrab` → window
      `GRAB_TILE` (Forge **synthetic**; titlebar still Mutter).
- [x] While GRAB_TILE and `allowDragDropTile()` true (host:
      `mod-mask-mouse-tile=None` → always true): `_handleMoving` paints
      five-zone preview on target TILE / empty-mon preview. Host has
      `preview-hint-enabled=false` — hints still via mod=`None`.
- [x] Grab-end with zone under pointer commits via
      `moveWindowToPointer` (edge slot-split D032, CENTER join D024,
      empty-mon D022/R015, wrap-in-slot Model B). Not a no-op.
- [x] Cross-mon: no Shell freeze. Foreign strip = spacer-only mid-grab
      (PR9). Join-at-index commit still D044. Non-strip cross-mon uses
      normal tile zones / empty-mon.
- [x] Same-strip REORDER float+gap unchanged (PR4/PR5). Do not reparent
      live tab onto foreign strip mid-Mutter grab.
- [x] Unit: peel enters GRAB_TILE; motion paints or calls zone path;
      grab-end commits structure change for at least one edge/CENTER
      case from a TABBED child; foreign spacer-only + join still green.
- [x] L0 green: tab-strip-reorder + DnD comprehensive + tab-drag +
      normalize + Tree-ops (same suite as PR9).
- [x] Nest only if unit cannot prove grab/paint; mon=1 default; dual
      only for cross-mon; **stop nest when done**. Prefer nest over host
      thrash for freeze class. *(skipped — unit proves)*
- [x] No commit/push unless asked.

## Context for the next agent (complete + succinct)

### Root fixed

| Bug | Root | Fix |
| --- | --- | --- |
| Peel no overlay / drop no-op | Tab press is **St chrome**, not Meta frame. `_startTabMoveGrab` called `begin_grab_op`; `ok===true` dropped stage listeners and skipped synthetic. Host Wayland often never emits grab-op-begin → mode stayed **TILE** → `_handleMoving` early-return → grab-end no commit | Tab peel **always** Forge synthetic GRAB_TILE (`_beginSyntheticTabMove`); **do not** call `begin_grab_op` for chrome peel. Stage motion + release own paint/commit. Titlebar still Mutter. |
| Cross-mon “broken” (same class) | Same dead ownership handoff — no GRAB_TILE → no zones / no foreign path / no empty-mon commit | Same synthetic ownership; PR9 spacer-only + D044 join-at-index unchanged |

### Also

- No second DnD engine; D044 untouched; foreign **spacer-only** kept.
- Residual product: peeled window frame may not free-float under pointer
  (zones + commit use pointer coords). Titlebar free-float unchanged.
- PR11 mid-drag gap equalize still open (serial; do not fold).

### Files

| File | Change |
| --- | --- |
| `lib/extension/drag-drop.js` | `_startTabMoveGrab` always synthetic for tab peel |
| `tests/unit/extension/tab-strip-reorder.test.js` | peel+begin_grab_op true; peel edge/CENTER commit |
| `tests/unit/window/WindowManager-tab-drag.test.js` | begin_grab_op true → still synthetic |
| `tests/unit/window/WindowManager-drag-drop-comprehensive.test.js` | peel → cross-mon CENTER join |

### L0

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-normalize-group-home.test.js \
  tests/unit/tree/Tree-operations.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js
# 202/202 green
```

### Session note

**2026-08-17 (PR10 implementer):** **done**.

Peel slot place + cross-mon failed because chrome peel trusted
`begin_grab_op===true` as Mutter ownership, dropped stage, and never got
`GRAB_TILE` when grab-op-begin did not fire. Fix: tab peel is always
Forge synthetic GRAB_TILE (paint via `_handleMoving`, commit via
`finishTabDragRelease` → grab-op-end path). Foreign spacer-only + join
index kept. Nest skipped. No commit/push. **PR11 unblocked.**

### Orchestrator note

PR10 complete on master (uncommitted with PR6–PR9). Host eyes-on after
install/logout: peel → five-zone paint → edge/CENTER place; dual-mon
foreign strip spacer + join; empty-mon drop. Do **not** start PR11 in
the same concurrent edit of `drag-drop.js` until this tip is settled
for the next serial agent. PR11 = mid-drag gap equalize only.
