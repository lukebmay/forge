# forge-dnd-minsize-red-zones-wayland — Live red zones on Wayland

**Status:** done  
**Plan:** (none)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-19

## Goal

DnD chroming paints **red** (`.window-tilepreview-invalid`) on drop locations
where the drop would force any involved app below its Mutter/client minimum
size. HSPLIT, VSPLIT, and TAB zones are evaluated independently.

## Root cause (Wayland / GNOME 46)

- `Meta.Window.get_size_hints` / `get_min_size` are **undefined** (not in
  Mutter 14 typelib).
- Learn-from-clamp never stuck: forge-caused `size-changed` returned before
  `noteWindowMinFromClamp`, and there was no delayed follow-up after
  `move_resize`.
- Grab-time probe (when needed) briefly poisoned known mins from the restore
  frame until request bookkeeping + probing flag were fixed.

## Done in tree

- Learn mins on forge-caused size signals + `_scheduleMinClampLearn` after move
- `ensureWindowMinSizeKnown` probe (32×32 → learn clamp → restore); blocks
  `move()` / thrash restore while `_forgeMinProbing`
- Session `wm_class` floor (`rememberClassMin` / `classMinFloor`)
- Per-zone `zoneOverflow` on preview: invalid zones stay red even when not
  hovered (HSPLIT / VSPLIT / TAB separate)
- contracts.md row updated
- L0: drop-intent + drag-drop

## Acceptance

- [x] VSPLIT can be red while HSPLIT/TAB stay valid for the same target
- [x] Nest: Nautilus probe → known **360×380**; on 800×600 slot:
      VSPLIT overflow true, HSPLIT/TAB false
- [x] Unit tests green (54 drop-intent/drag-drop)
- [ ] Host eyes-on after **logout** (tip still pre-dirty until logout)

## Context for the next agent

- Paths: `tree-layout.js`, `window.js` (`ensureWindowMinSizeKnown`,
  `_scheduleMinClampLearn`), `drag-drop.js` (`zoneOverflow` + grab probe)
- Dev: `preview-hint-enabled=true` this session (was false)
- Host tip needs logout once for dirty install
- Do not re-break live-pointer preference on titlebar DnD
- Absurd learn caps still 1200w / 800h

## Session note

Nest proved clamp learn + independent zone overflow. Host ping still
`…-ga46cbd8` (no `-dirty`) until Wayland logout.
