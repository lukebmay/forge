# forge-dnd-preview-miss-titlebar — Titlebar grab with no zone preview (host)

**Status:** done (agent); host eyes-on soft
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

Every forge-managed TILE titlebar drag that can commit a zone drop must show
preview-hint zones (when `preview-hint-enabled=true`) and log `dnd grab MOVING`
before `grab-op-end` / `dnd commit`.

## Acceptance

- [x] Code path: TILE titlebar grab arms stage track / `_draggedNodeWindow`;
      journal has `dnd grab MOVING mode=TILE` (L0)
- [x] FLOAT / non-TILE MOVING logs `dnd grab MOVING skip mode=…` and
      `dnd grab-op-end skip reason=no-grab-tile` — no lone `render tree from
      grab-op-end`
- [x] Regression vs shipped titlebar focus-lag fix still green
- [x] L0 drag-drop / drop-intent / titlebar suites green; new FLOAT + TILE cases
- [ ] Host Wayland eyes-on (soft) — do not block

## Root cause

Host journal `@ 06:49:20` after vinyl hard-ready: lone
`render tree from grab-op-end` with **no** `dnd grab MOVING` / `dnd commit`.

Inkscape was **FLOAT** after failed vinyl apply (tree dump had no paint `rect`;
`raise-float-queue` right after place-hint adopt; slot machines hard-failed on
`mon0.inkscape`). Grab-begin only arms `GRAB_TILE` + stage track when
`grabMode=MOVING` **and** `mode=TILE` — FLOAT correctly skipped zone UI, but
grab-end still always `commitLayout("grab-op-end")`, which produced the smoking
gun. Later Nautilus TILE DnD logged normally (`06:49:38+`).

Not a residual of titlebar focus-lag (that path remains correct for TILE).

## Fix

- Log `dnd grab MOVING skip mode=<mode> [maximized] [fullscreen]` when MOVING
  but not TILE
- Gate zone commit + `commitLayout("grab-op-end")` on armed `GRAB_TILE`; MOVING
  without arm → `dnd grab-op-end skip reason=no-grab-tile` (no lone render)
- Resize / non-moving grabs still commit as before

## Paths

- `lib/extension/drag-drop.js` — `_handleGrabOpBegin` / `_handleGrabOpEnd`
- `tests/unit/window/WindowManager-drag-drop.test.js` — FLOAT skip + TILE log/commit

## L0

```text
WindowManager-drag-drop + comprehensive + tab-drag + structure-one-commit +
tab-strip-reorder + bug-175/r015/r012/62ja/9fwj → 205 passed
drop-intent + drop-zones + drop-target-rect + grab-fuzz + r021-r024 + d4 → 110 passed
```

## Session note

Pair residual: vinyl slot-id hard-fail / FLOAT after apply —
`forge-layout-vinyl-hardfail-slot-ids.md`. Host soft: after tip load, TILE
titlebar drag should show zones; FLOAT drag should log skip (not silent
grab-op-end).
