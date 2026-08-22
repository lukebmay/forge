# forge-min-learn-oversized-frame — Learn mins when settled TILE frame > slot

**Status:** ready
**Plan:** [forge-min-size-floor](../plans/forge-min-size-floor.md) (D049 residual)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

When a TILE is **settled** and its frame is larger than its slot on an axis,
raise that app’s known/class min on those axes, then run the normal overflow
workflow (same-mon tab BFS → float). Do not leave content visually larger
than the tile without updating mins.

## Acceptance

- [ ] Settled TILE with `frame.width > slot.width+ε` (and/or height) →
      `noteWindowMin…` / class `window-mins.json` updated on those axes
- [ ] Then `rehomeIfSlotTooSmall` / open-min path: neighbor tab, else float
- [ ] Does **not** fight ApplyEpoch; skips GRAB / max / fs (same as today)
- [ ] Ratchet-down when frame **fits** slot still works (poisoned mins)
- [ ] L0: unit for “oversized settled frame → learn → overflow decision”
- [ ] Host: stack Nautilus until a pane is shorter than natural height → learn
      + tab/float, not silent visual overflow

## Context

D049 already has clamp-learn (`noteWindowMinFromClamp` vs last
`move_resize` request) and mid-session `rehomeIfSlotTooSmall`. Gap: if forge
never got a refused-smaller request (or learn skipped glued-to-prior),
`readWindowMinSize` stays at floor/class and `_slotTooSmallForTile` may be
false while the **frame still overflows the slot visually**.

Host 2026-08-22: some Nautilus tiles looked bigger than their panes during
VSPLIT stack — operator expects heuristic learn on oversized settled frames.

## Session note

Operator clarified intended heuristic. Next session implement + prove.
