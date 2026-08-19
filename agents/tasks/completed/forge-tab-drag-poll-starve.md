# forge-tab-drag-poll-starve — Tab chip lags / stuck after release (Wayland)

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-19

## Goal

Fix host Wayland: first tab drag OK; later drags leave chip far behind pointer
and stay “dragging” after mouse release. Keep **one** gesture owner
(`DragDropManager`).

## Root cause

- `tabDragPointer` poll (~8 ms) re-entered full `noteTabDragMotion` →
  `_handleMoving` even when pointer already synced.
- `SourceBag` logged every set/fire/replace at **DEBUG**; with
  `logging-enabled` + `log-level=5` that was hundreds of journal lines/sec
  during drag (`previewHintFailsafe` replace spam too).
- Main loop starvation → chip leave-behind + delayed/missed release feel.

## Fix

- SourceBag routine set/fire/replace/cancel → **TRACE** (dispose/cancelAll stay DEBUG)
- Poll: skip motion when xy already matches `state.lastX/Y`
- Poll: after observing primary-down in mods, primary-up → `finishTabDragRelease`
- contracts row updated
- L0 tests; nest smoke; handoff

## Acceptance

- [x] Chip tracks pointer on repeated tab drags under DEBUG logging (code path)
- [x] Release ends gesture (stage or poll button-up)
- [x] Single owner still `DragDropManager` (tree press-arm only)
- [x] L0 tab-drag + sources + DnD suites **197** green
- [x] Nest `_forge-test-clean` ok; `running: False`

## Context for the next agent (complete + succinct)

| Piece | Detail |
| --- | --- |
| Owner | Still only `DragDropManager` — tree press→`armTabDrag`; no second gesture manager |
| Starve | DEBUG SourceBag fire/set on 8 ms poll + failsafe replace |
| Paths | `sources.js` · `drag-drop.js` · contracts · tab-drag tests |
| Host | **Logout once** (or nest already has tip) then retest tab peel repeatedly |

```bash
npm test -- tests/unit/window/WindowManager-tab-drag.test.js \
  tests/unit/extension/sources.test.js \
  tests/regression/bug-tab-press-arm-drag.test.js \
  tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js
# 197 passed
./install --kit=vim
./scripts/forge/forge-test nested run --monitors=1 -- \
  bash -lc 'forge ping; env FORGE_JOB=0 forge layout _forge-test-clean'
./scripts/forge/forge-test nested status   # running: False
```

## Session note

**Done 2026-08-19.** Host repro: first tab DnD OK; 2nd/3rd chip far behind +
stuck after release. Confirmed one gesture owner. Fixed poll skip + TRACE
SourceBag hot logs + poll button-up finish. No commit/push.
