# DnD min-size gate + titlebar peel from tabs

**Status:** done  
**Updated:** 2026-08-19

## Goal

1. Red/invalid drop preview + refuse when post-drop slot &lt; app mins
2. Luke palette as bundled defaults; invalid = floated red
3. Restore titlebar/CSD drag drop from TABBED (chip peel already worked)

## Slice 0 probe

Wayland nest GNOME 46: `get_size_hints` / `get_min_size` undefined on Meta.Window.
Nautilus still clamps ~380px height. Gate uses hints + learned clamp
(`noteWindowMinFromClamp`); unreadable → fail-open.

## Done in tree

- `readWindowMinSize` / `noteWindowMinFromClamp` (`tree-layout.js`)
- `dropWouldOverflowMins` (`drop-intent.js`) + `moveWindowToPointer` refuse
- `.window-tilepreview-invalid` + Luke palette in `stylesheet.css`
- Titlebar: `_armGrabPointerTrack` for Wayland parked pointer; `grabMode` treats
  `WINDOW_BASE` as MOVING; Meta mock `WINDOW_BASE: 1` (Mutter 46)
- contracts.md rows
- L0: drop-intent + drag-drop (+ tab-drag / s6g / bug-151)

## Verify

- L0 green: drop-intent, drag-drop, tab-drag, s6g, bug-151, comprehensive DnD,
  leqs/62ja WINDOW_BASE
- `./install --kit=vim` (Wayland needs logout for host tip)
- Nest `running: False`

## Follow-up 2026-08-19 (false-red + zones gone)

**Bugs:** Non-tab DnD zones missing (grab pointer track preferred over live
pointer). Nautilus false-red on legal quarter L/C/R (poisoned learn from
pre-resize frame).

**Fixes:** Live pointer wins when moved; track only if parked *and* track
moved. Clamp learn delayed + priorFrame; discard absurd known mins (>1200w /
>800h). Overflow checks dest app/group too. Keybind move/swap skips overflowing
slots.

## Host eyes-on (2026-08-19)

1. Non-tab DnD zones **restored** (live pointer preference fix)
2. **Residual:** no red/invalid zones appearing yet — min reader still
   fail-open on Wayland (hints missing; learned mins not sticking / capped).
   Pickup: make mins readable or prove learn path, then red + keybind skip
   become visible.
3. Titlebar-drag from tabs / palette / refuse wiring are in tree; gate is
   inert without mins.
