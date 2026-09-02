# forge-open-min-dnd-cold-wayland

**Verdict:** close
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-open-min-dnd-cold-wayland.md

## Stated status
ready for implement — stale; superseded by D049 + later DnD paint

## Leftovers
- Plan still describes shrink-probe Fixes 1/3; those APIs are deleted
- Soft host tiny-env / red-zone eyes-on lives on min-size-floor + D049 blocker,
  not here
- No remaining implement unique to this spine

## Why this verdict
Lens: if D049 / min-size-floor already shipped the strategy, **close**.
D049 L2 deleted shrink-probe (`ensureWindowMinSizeKnown` gone in `lib/`).
KEEP pieces from min-size-floor’s “prior plans” table are in tree:
titlebar `_armGrabPointerTrack` stage MOTION + poll → `_handleMoving`;
`window-mins.json` persist; env floor so DnD never fail-opens unknown mins.
Do not keep a duck-tape implement plan on `drag-drop.js`. Import DnD
motion + mins strategy (Absorb).

## Destination
archive → `agents/plans/archived/completed/forge-open-min-dnd-cold-wayland.md`

## Absorb
- Titlebar/CSD GRAB_TILE: stage captured-event + pointer poll drive
  `_handleMoving` (tab chrome already did); `Clutter.EVENT_PROPAGATE`
- **No** shrink-probe / mid-drag dest `move_resize` (D049 L2)
- Durable class floors: `window-mins.json` via `rememberClassMin`
- DnD red/refuse uses `readWindowMinSize` (hints ∪ known ∪ class ∪ env
  floor); never “unknown → allow”
- Do not change D044 / PlaceNext pins / DnD refuse semantics
