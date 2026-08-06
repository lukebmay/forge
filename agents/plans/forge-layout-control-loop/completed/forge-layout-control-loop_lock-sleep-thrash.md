# Task: forge-wayland-live_lock-sleep-thrash

**Status:** done (unit green; operator overnight re-verify)  
**Plan:** residual on `plan/forge-layout-control-loop`  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-06

## Problem

Wake from **lock after sleep** on Wayland left a thrashed dual-mon desk. Trace:
`soft-rehome → normal settle` after unlock; overnight DPMS can pile Meta windows
while Forge still runs under `unlock-dialog` (tree stays loaded). Soft-rehome
could snapshot thrash frames as last-good, or settle against wrong geometry
before heads finished probing (colord failures in journal).

## Fix

1. **On lock** (`unlock-dialog`): arm **lock layout shield** (tree forest + frames + focus).  
2. **While locked**: no soft-rehome settle; hold thrash flag on workareas; suppress entered-monitor; do not update last-good / session-layout.json.  
3. **On unlock**: short **8s** shield + **900ms** settle; soft-rehome uses shield reapply (not thrash snapshotTree).

## Acceptance

- [x] Unit: lock holds / no settle; entered-monitor suppressed; unlock restores dual mon after thrash  
- [x] Full vitest green  
- [ ] Operator: lock → sleep → wake dual-mon desk holds (or soft-rehomes to pre-lock layout)

## Session note

**2026-08-06:** Implemented + tests. Live install still on older versionName until re-install.
