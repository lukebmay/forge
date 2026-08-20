# forge-min-size-floor_m1 — Env floor pure + readWindowMinSize

**Status:** done
**Plan:** [forge-min-size-floor](../forge-min-size-floor.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-19
**Model:** 4.5

## Goal
Env floor pure + readWindowMinSize per plan locks L1–L8 / D049.

## Acceptance
- [x] Matches plan slice M1
- [x] Session note when done

## Context for the next agent
See plan `M1` section. Serial: M1→M2 before M3 (shared window.js). Do not reintroduce shrink-probe.

## Session note

**2026-08-19 M1 done.**

### Changed
- **New** `lib/shared/min-tile-size.js` — pure `defaultMinTileSize({ env, widthKey?, heightKey? })`; constants `FORGE_MIN_TILE_WIDTH` / `FORGE_MIN_TILE_HEIGHT` / `DEFAULT_MIN_TILE_WIDTH=320` / `DEFAULT_MIN_TILE_HEIGHT=240`. Positive ints only; invalid/missing → defaults. gi-free.
- **`lib/extension/tree-layout.js`** — `readWindowMinSize(meta, opts?)` merges hints ∪ known ∪ class then `max(..., envFloor)` per axis. Env from `opts.env` or `GLib.getenv`. Null meta → floor (no fail-open zeros). Re-exports floor helpers.
- **No gsettings.**

### Tests
- **New** `tests/unit/shared/min-tile-size.test.js` (4)
- **Updated** `tests/unit/extension/drop-intent.test.js` — floor expectations; tiny-env for hint/learn merge; fail-open DnD → floor overflows tiny slot
- **Updated** `tests/unit/extension/open-min-place.test.js` — pure unknown-mins via `unitMinsFor` zeros; floor→float on tiny LFT
- **Updated** `tests/unit/window/WindowManager-open-app-policy.test.js` — leftover CON rects; small-LFT half ≥ 320 floor

### L0
```
npm test -- tests/unit/shared/min-tile-size.test.js tests/unit/extension/drop-intent.test.js
→ 40 passed
```
Also green after open-min / open-app-policy fixture updates (probe-specific drag-drop fails expected until M2: floor makes `known.width/height > 0` so probe queue never arms).

### Next
M2 — excise shrink-probe product code (inventory in plan). Do not start M3.
