# Soft rehome on workareas thrash (H1)

**Date:** 2026-07-23  
**Plan:** [forge-harden-and-session](../../plans/forge-harden-and-session.md)  
**Task:** [completed soft-rehome](../../plans/forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md)  
**Commit:** `a897516` (local; push to `jcrussell/forge` may need write access)

## Why

Overnight GNOME auto-lock → wake (dual 4K, hybrid GPU) fired `workareas-changed` thrash while Mutter reassigned windows to the primary. Eager `window-entered-monitor` rehomes left the tree piled under one head after both monitors returned.

## What shipped

- Last-good `{ monitorIndex, frame }` snapshot after quiet renders
- Debounced settle (~200ms) on workareas-changed
- Suppress monitor-enter rehome while thrash pending
- Target monitor by max frame∩geometry intersection; then `move_to_monitor` + one `_reconcileWindowHomes`
- Missing monitor node → `reloadTree` + layout groups
- Tests + user docs + `docs/DESIGN.md`

## Not done

- Live blank/wake verify on host `black`
- Stable EDID monitor IDs (only if thrash remains)
- Session / `workon` layout apply

## Key paths

- `lib/extension/window.js` — soft rehome orchestration
- `lib/extension/utils.js` — `bestMonitorIndexForRect`
- `tests/regression/bug-h1-soft-rehome-workareas-thrash.test.js`
