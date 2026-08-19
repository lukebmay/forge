# forge-tab-drag-event-owner — One owner for tab drag pointer events

**Status:** done
**Plan:** [forge-tab-click-drag](../../plans/forge-tab-click-drag.md) follow-on
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-18

## Goal

Tab strip dragging feels solid at normal mouse speeds: the floating chip /
gap preview keeps up with the pointer; release drops cleanly without a
second click. **One source file** owns all tab-drag pointer event handling.

## Acceptance

- [x] Inventory every press/motion/release/cancel path that drives tab drag
- [x] Single owner (`drag-drop.js` / DragDropManager) connects and interprets
      gesture events; tree press-arms only
- [x] Fast drag path: stage capture + pointer poll; no actor leave-behind
- [x] Peel / reorder / residual clear still honor D046 / PR9–PR15
- [x] L0: tab-drag suites + leave-actor / poll regressions green (**152**)
- [x] Nest: install tip + `_forge-test-clean` **ok**; nest **stopped**
- [x] Session note + PRIORITY/HANDOFF; contracts row for event owner

## Context for the next agent (complete + succinct)

### Root cause

Dual owners: `tree.js` tab `motion-event` / `button-release` **and**
`drag-drop.js` stage `captured-event`. Fast pointer outruns the floating
chip → actor motion stops → chip freezes until the pointer re-enters; release
often missed off-actor.

### Fix

| Piece | Detail |
| --- | --- |
| Owner | `DragDropManager` in `lib/extension/drag-drop.js` only |
| Stage | `captured-event` → `_onTabDragStageEvent` (STOP on motion/release; coords or `get_pointer` fallback) |
| Poll | `SourceBag` slot `tabDragPointer` (~8 ms) while armed — skipped motion frames |
| Tree | Press → `armTabDrag` only; deleted `_noteTabDragFromEvent` / `_finishTabDragFromEvent` |
| Clear | `clearTabDragResiduals` cancels stage ids + poll |

### Prove

```bash
npm test -- tests/unit/window/WindowManager-tab-drag.test.js \
  tests/regression/bug-tab-press-arm-drag.test.js \
  tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js
# 152 passed
./install --kit=vim
./scripts/forge/forge-test nested run --monitors=1 -- \
  bash -lc 'forge ping; env FORGE_JOB=0 forge layout _forge-test-clean'
./scripts/forge/forge-test nested status   # running: False
```

Host Wayland: **logout** once to load tip for desk drag feel (install noted live reload blocked).

## Session note

**Done 2026-08-18.** Orchestrator implemented after two subagents stalled on
explore. Dual tree+stage path removed; stage STOP + pointer poll. Contracts
row added. No commit/push.
