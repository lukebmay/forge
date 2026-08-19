# forge-dnd-minprobe-grab-fight — Grab-end min-probe thrash broke DnD / tile sizes

**Status:** done  
**Plan:** (none)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-19

## Goal

Fix host regressions after open-min/DnD cold tip: tab stuck / no drop zones,
titlebar DnD dead after `layout`+Nautilus, wrong tile sizes — recovered later
in-session.

## Root cause

Grab-end + mid-drag queued **dest** shrink probes (`move_resize` 32×32). Chrome
often never shrinks → mins stay unknown → **every** drag re-probed. Probes raced
`commitLayout` and next MOVING grab (`_forgeMinProbing` blocked `move()`).
Journal: repeated `minProbe:*` per grab; `minClampLearn` thrash.

## Fix

- Cancel in-flight probes on MOVING grab-begin (`_cancelMinSizeProbes`)
- No mid-drag dest probe queue
- Grab-end: clear leftover queue; queue **dragged only** with delayed flush
- Failed shrink → `_forgeMinProbeGaveUp` (no forever-retry)
- contracts + DESIGN note

## Acceptance

- [x] L0 drag-drop + drop-intent + open-min + open-app-policy **116**
- [x] Nest mon=1 `_forge-test-clean` ok; `running: False`
- [ ] Host eyes-on after **logout** (operator)

## Session note

Host tip needs logout. After logout: `forge layout dev` → open Nautilus →
titlebar + tab DnD before any peel; sizes should stick; journal should not
spam `minProbe` on every hover dest.
