# forge-open-min-late-adopt — Late-identity open-min on TILE adopt

**Status:** done  
**Updated:** 2026-08-22  
**Branch:** master

## Bug (host)

`forge layout dev`, focus right-mon ghostty, launch Nautilus ×3:

1. Windows stack vertically in the left pane.
2. After the 3rd settles (~320ms), **all three** `overflow-tab` into the existing right TABBED chrome group.

## Root cause (logs)

- Map: `Meta Window null 0` / `class=null title=null` → `isFloatingExempt` → `willTile=false`.
- Free-open `_decideOpenMinPlacement` is gated on `willTile` → **skipped** (no `track insert min=`).
- `_tileInsertUnit` still set (R028).
- Identity lands → `FLOAT→TILE` → `_adoptOpenIntoTileSlot` did **blind** `slotSplitForInsert` (no mins).
- Slots shrink below class floor (Nautilus 360×380); `min-learn-oversized fh=380 sh=350` → each window `overflowRehome` → BFS finds the roomy right TABBED → `overflow-tab` ×3.

## Fix

`wm._adoptOpenIntoTileSlot`: run the same `_decideOpenMinPlacement` as free `trackWindow` (tab / float / else leftover+slotSplit) before splitting.

## Verify

- L0: open-app-policy (incl. new late-null adopt) + insert-slot-split + overflow-rehome + open-min-place + late-wmclass/title/R031 → **99** green.
- Host: tip install; logout once (or nest); re-run Nautilus ×3 from right ghostty — 2nd+ should tab with LFT (or float), not stack-then-dump to right chrome tabs.

## Paths

- `lib/extension/window.js` (`_adoptOpenIntoTileSlot`)
- `tests/unit/window/WindowManager-open-app-policy.test.js`
- `docs/dev/contracts.md` (free-open row)
