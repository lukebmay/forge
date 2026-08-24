# forge-d026-post-echo-slot-reassert — sole maximize shrinks, indigo border full

**Status:** agent done (host tip retest open)
**Branch:** master
**Updated:** 2026-08-23

## Symptom

WS2 sole Inkscape titlebar maximize: Meta frame shrinks upper-left; indigo
TILE border stays full-slot. Same class as prior WS1 maximize report.

## Cause

D026 `_restoreTileToSlot` unmaximizes + `move_resize` to slot and starts the
350ms command echo. Wayland applies the unmaximize restore-size **during**
echo → chrome-only `updateMetaPositionSize` → then silence. AC2 only heals on
a later size-changed after echo; that signal never comes.

## Fix

- `window.js`: TRACE `d026-restore`; `_schedulePostEchoSlotReassert` after
  restore (residual+40ms) → one forced `reassertNodeToSlot` if still mismatched
- Regression: `bug-w-render-storm` “mid-echo unmaximize snapback…”

## Verify

```bash
npm test -- tests/regression/bug-w-render-storm.test.js \
  tests/regression/bug-dyt2-lone-maximize-preserved.test.js
./install --dev   # tip reload, then Inkscape maximize on vinyl WS2
forge log --grep 'd026-restore|post-echo-slot' --level trace --since 5m
```
