# forge-min-learn-oversized-frame — Learn mins when settled TILE frame > slot

**Status:** done
**Plan:** [forge-min-size-floor](../forge-min-size-floor.md) (D049 residual)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

When a TILE is **settled** and its frame is larger than its slot on an axis,
raise that app’s known/class min on those axes, then run the normal overflow
workflow (same-mon tab BFS → float). Do not leave content visually larger
than the tile without updating mins.

## Acceptance

- [x] Settled TILE with `frame.width > slot.width+ε` (and/or height) →
      `noteWindowMin…` / class `window-mins.json` updated on those axes
- [x] Then `rehomeIfSlotTooSmall` / open-min path: neighbor tab, else float
- [x] Does **not** fight ApplyEpoch; skips GRAB / max / fs (same as today)
- [x] Ratchet-down when frame **fits** slot still works (poisoned mins)
- [x] L0: unit for “oversized settled frame → learn → overflow decision”
- [ ] Host: stack Nautilus until a pane is shorter than natural height → learn
      + tab/float, not silent visual overflow *(soft / human — not agent gate)*

## Context

D049 already has clamp-learn (`noteWindowMinFromClamp` vs last
`move_resize` request) and mid-session `rehomeIfSlotTooSmall`. Gap: if forge
never got a refused-smaller request (or learn skipped glued-to-prior),
`readWindowMinSize` stays at floor/class and `_slotTooSmallForTile` may be
false while the **frame still overflows the slot visually**.

## Session note

**2026-08-22 done.** No commit/push. Host eyes-on soft (existing tiny-env
blocker still covers Nautilus prove).

### Approach
- Pure learn: `noteWindowMinFromOversizedFrame` + `frameOverflowsSlotForLearn`
  (`tree-layout.js`) — raise known/class on axes where frame > slot+ε;
  absurd caps same as clamp-learn (D026 keeps absurd frames).
- WM: `rehomeIfSlotTooSmall` learns clamp ∪ oversized-frame first, then
  tab/float. Detect via `_needsOverflowRehome` = mins overflow **or**
  learnable frame>slot (`updateMetaPositionSize`, `_scheduleMinClampLearn`,
  `_restoreTileToSlot`).
- Existing ratchet-down when frame fits slot unchanged. ApplyEpoch / GRAB /
  max / fs / zoom still skipped.

### Paths
- `lib/extension/tree-layout.js`
- `lib/extension/window.js`
- `docs/dev/contracts.md` (mins + mid-session rows)
- L0: `WindowManager-overflow-rehome.test.js` · `drop-intent.test.js`

### L0
```
npm test -- tests/unit/window/WindowManager-overflow-rehome.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/unit/extension/open-min-place.test.js \
  tests/unit/shared/min-tile-size.test.js
→ 81 passed

npm test -- tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js
→ 67 passed
```

### Residuals
- Soft host: stack Nautilus VSPLIT until pane shorter than natural → learn +
  tab/float (fold into [d049-tiny-env-nautilus](../../blockers/d049-tiny-env-nautilus.md)
  or eyes-on after tip load).
- Do not reintroduce shrink-probe.
