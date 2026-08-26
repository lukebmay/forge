# forge-focus-close-and-escape_fc2-unfocus — Ctrl+Super+Esc unfocus / mode exit

**Status:** completed  
**Plan:** [forge-focus-close-and-escape](../../forge-focus-close-and-escape.md)  
**Branch:** master  
**Depends:** FC0 (policy doc only); can parallel FC1  
**Updated:** 2026-08-09

## Goal

Bind **Ctrl+Super+Escape** (Forge keybinding profile) to:

1. If a Forge “mode” is active (future selection / grab UI) → exit mode.
2. Else → **unfocus tiles** (no TILE keyboard focus; shell/desktop preferred).

## Acceptance

- [x] Keybound action registered; default kit documents it
- [x] Mode exit hook is a no-op when no mode (stable API)
- [x] Unfocus: no TILE is `focusMetaWindow` after action (best-effort on Wayland)
- [x] Explicit unfocus does not immediately re-focus last tile via hover/LFT
- [x] Live X11 smoke; document Wayland residual if any

## Context

- Prefer stage key focus clear / desktop; avoid focus ping-pong with focus-on-hover.
- Do not invent selection modes here — only the exit hook.

## Session note

2026-08-09 shipped:

| Piece | Where |
| --- | --- |
| GSettings `window-unfocus` default `Ctrl+Super+Escape` | schema + all kits (safe/vim/i3) |
| Command `WindowUnfocus` | `command.js` → `exitForgeMode` then `unfocusTiles` |
| `exitForgeMode()` | `window.js` — returns `false` until modes exist |
| `unfocusTiles()` | `focus.js` — stage key focus null/panel; hover suppress meta |
| Hover suppress | `_unfocusHoverSuppressMeta` until pointer leaves that window; cleared on `afterFocus` |
| LFT | **Not** cleared (placement MRU stays) |
| Docs | `docs/user/keybindings.md` |
| Units | Keybindings, CommandHandler, FocusManager, action-pipeline, kits |

**Live X11:** XTest inject `Ctrl+Super+Escape` → `forge tree` `focusWindowId` `None`; `lastTileFocusWindowId` retained; `forge focus lft` restores then unfocus again works.

**Wayland residual:** not re-run this session (logout). Stage `set_key_focus` + panel best-effort; hover suppress still applies when focus-on-hover is on. Re-check before next Wayland CT.

Next: FC3 live matrix (sibling/promote/LFT/unfocus) when convenient; or PRIORITY mid items.
