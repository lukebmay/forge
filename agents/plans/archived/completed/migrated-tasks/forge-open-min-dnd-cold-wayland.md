# forge-open-min-dnd-cold-wayland — Open-min group home + titlebar DnD cold + false reds

**Status:** done  
**Plan:** (none)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-19

## Goal

Fresh Wayland after `forge layout dev`: (1) dock-open when split overflows mins → same-mon tab / float; (2) titlebar DnD overlays+commit without prior tab peel; (3) red zones only when drop truly overflows.

## Done in tree

- No `ensureWindowMinSizeKnown` during MOVING grab; queue + flush after grab-end
- Titlebar `_armGrabPointerTrack` drives `_handleMoving` (PROPAGATE)
- Durable `forgeConfigDir()/window-mins.json` load on enable / save on remember
- Post-open `_queueMinSizeProbe` after open-commit / open-min-float
- Clamp learn: skip glued-to-prior; skip while probing; ratchet-down on accept; longer Wayland delay
- contracts + DESIGN note
- L0: drop-intent + open-min-place + open-app-policy + drag-drop **112**
- Nest: mon=1 `_forge-test-clean` ok; `running: False`
- Host seed: Nautilus 360×380 in `~/.config/forge/config/window-mins.json`

## Acceptance

- [x] Grab-begin does not probe/move_resize during MOVING grab
- [x] Titlebar stage motion drives `_handleMoving`
- [x] Class mins persist + post-open probe
- [x] Clamp learn hardened
- [x] L0 green; nest stopped; HANDOFF updated
- [ ] Host eyes-on after **logout** (operator)

## Context for the next agent

- Host tip still deferred until logout (Wayland)
- After logout: titlebar-drag before any tab peel; dock Nautilus onto short/tall LFT
- Do not probe mid-grab again; do not prefer track over live pointer when moved

## Session note

Root causes: fail-open without class floor; probe mid-grab suppressed overlays and fought Mutter; learn-from-prior poisoned reds. Fix shipped; host logout required for tip.
