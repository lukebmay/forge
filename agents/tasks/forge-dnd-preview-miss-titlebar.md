# forge-dnd-preview-miss-titlebar — Titlebar grab with no zone preview (host)

**Status:** ready
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

Every forge-managed TILE titlebar drag that can commit a zone drop must show
preview-hint zones (when `preview-hint-enabled=true`) and log `dnd grab MOVING`
before `grab-op-end` / `dnd commit`.

## Acceptance

- [ ] Host Wayland: titlebar-drag a TILE (incl. post-ApplyLayout Inkscape) shows
      zone hover preview before release
- [ ] Journal always has `dnd grab MOVING mode=TILE` for those gestures; no
      lone `render tree from grab-op-end` without grab/commit for TILE moves
- [ ] Regression vs shipped titlebar focus-lag fix still green
      (`forge-dnd-titlebar-focus-lag`)
- [ ] L0: existing drag-drop / preview suites still pass; add case if gap found

## Context for the next agent (complete + succinct)

### Symptom (host 2026-08-22)

Operator corrected vinyl desk by dragging Inkscape on the **same** monitor;
**no hover DnD effects** recalled. Later Nautilus DnD **did** commit zones
(`CENTER` / `BOTTOM` / `LEFT` / `empty-mon`) with normal `dnd grab` /
`dnd commit` lines.

### Journal smoking gun

@ `2026-08-22 06:49:20` (Shell pid 13750), immediately after vinyl hard-ready:

```text
[Forge] [DEBUG] render tree from grab-op-end
```

**No** preceding `dnd grab MOVING` and **no** `dnd commit` for that gesture.
First logged forge DnD in the session is `06:49:38` (`dnd grab` →
`dnd commit zone=CENTER`) on Nautilus.

Prefs at check time: `preview-hint-enabled=true`, `tiling-mode-enabled=true`.

### Hypotheses (investigate; do not shotgun)

1. Meta grab began before forge armed stage track / `_draggedNodeWindow`
   (residual of titlebar focus-lag class)
2. Inkscape was maximized/fullscreen/FLOAT — forge skipped zone UI
3. Preview actors created but not shown (z-order / size 0 / wrong unit)
4. Grab was resize or non-MOVING op misclassified in operator memory — confirm
   via Meta grab mode if logged

### Paths

- `lib/extension/drag-drop.js` — grab begin, `_previewHintsWanted`,
  `_createPreviewHint`, commit
- Related completed: `agents/tasks/completed/forge-dnd-titlebar-focus-lag.md`

### Reproduce

1. `forge layout` a profile that leaves a large TILE (or open Inkscape tiled)
2. Titlebar-drag before any tab peel; watch for zone tint
3. `journalctl -f | rg '\[Forge\].*dnd'`

## Session note

Filed from host verify after OH1 logging. Pair with vinyl hard-fail task —
desk was already wrong from apply before this drag.
