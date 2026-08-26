# forge-float-border-ghost-tile — R031 float border / ghost TILE

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-15

## Goal

Opening an always-float app (e.g. Kooha) must not leave a blank TILE slot
with a stuck red float border on a ghost node. Border (if any product
border) must follow the real floating Meta window, not a phantom tree slot.

## Acceptance

- [x] Root cause known (float path / placeholder / open-commit / border
      paint from tree vs Meta frame — not a guess)
- [x] Fix uses existing float + decoration contracts — no parallel
      float path
- [x] L0 guard that fails without the fix
- [x] Live: open Kooha (or catalog float class); no blank TILE ghost;
      border tracks float. Nest and/or host after install

## Context for the next agent (complete + succinct)

- REGRESSIONS R031 shipped; live `L1.r031-float-border-follows` (`--tags R031`)
- Classes: `io.github.seadve.Kooha` / `kooha`
- Host tip still needs logout for Wayland host pointer smoke
- R028 late-identity wrap is now on FLOAT→TILE (`_adoptOpenIntoTileSlot`),
  not at unknown map

## Session note

**2026-08-15 — R031 done.**

| Field | Detail |
| --- | --- |
| Root | Unknown-map R028 wrap reserved a TILE slot for windows that stay FLOAT; willTile wrap + later `is_above`/override left `[TILE, FLOAT]`. Decoration/`paintRectForWindow` painted FLOAT from stale slot (Wave Z TILE/ZOOM path), not Meta frame |
| Fix | Wrap only when `willTile`; `_adoptOpenIntoTileSlot` on FLOAT→TILE (R028); `_unwindOpenSlotWrap` when FLOAT is the extra child in a 2-child H/V CON; FLOAT `paintRectForWindow` is null; `showWindowBorders` uses `get_frame_rect`; `Node.float` clears slot rects |
| L0 | `bug-r031-float-border-ghost-tile` 4; insert-slot-split late-identity still wraps on TILE; float-toggle / 3hsv / borders / h7ba green |
| Nest | 2 zenity TILE + Kooha FLOAT; parent CON is 3-child HSPLIT (two tiles + float), `rect` null on Kooha, no placeholder; nest stopped |
| Host | Wayland; tip still previous until logout |

```bash
npm test -- tests/regression/bug-r031-float-border-ghost-tile.test.js \
  tests/regression/bug-172-float-toggle.test.js \
  tests/regression/bug-h7ba-float-paths-finalized-window.test.js \
  tests/unit/window/WindowManager-insert-slot-split.test.js
python3 -m pytest tests/unit/cli/test_live_matrix.py -q -k r031
# Live (XAUTHORITY = live /run/user/1000/.mutter-Xwaylandauth.* that xdpyinfo :1 accepts):
# ./install --kit=vim && forge nested run -- …
forge nested status   # running: False
```
