# T2 — Opt-in layout debug overlay

**Date:** 2026-07-24  
**Plan:** forge-daily-driver  
**Tags:** tiling, debug, overlay, observability

## Why

Percents, parent layouts, and monitor homes are hard to inspect live during
blank/wake thrash and sizing work. Overlays are for **human debugging**, not
permanent production chrome — opt-in, default off, modifier-heavy toggle.

## What shipped

- GSettings `layout-debug-overlay-enabled` (false by default).
- Keybind `layout-debug-overlay-toggle` → `Ctrl+Super+d`.
- Per-tiled-window St.Label: parent layout, percent/`auto`, monWs id, optional min size.
- Zero layout math impact when off; `disable()` / setting-off destroy actors.
- Prefs Debugging switch; troubleshooting + keybindings docs.

## Key paths

- `lib/extension/layout-debug-overlay.js` — pure format helpers + `LayoutDebugOverlay`
- Wire: `window.js` render/settings/disable, `command.js`, `keybindings.js`
- `tests/unit/extension/layout-debug-overlay.test.js`

## Not done here

- Live dual-4K positioning check; T3 blank/wake; T4 sizing policy.
