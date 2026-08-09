# forge-focus-close-and-escape_fc2-unfocus — Ctrl+Super+Esc unfocus / mode exit

**Status:** next  
**Plan:** [forge-focus-close-and-escape](../plans/forge-focus-close-and-escape.md)  
**Branch:** master  
**Depends:** FC0 (policy doc only); can parallel FC1  
**Updated:** 2026-08-09

## Goal

Bind **Ctrl+Super+Escape** (Forge keybinding profile) to:

1. If a Forge “mode” is active (future selection / grab UI) → exit mode.
2. Else → **unfocus tiles** (no TILE keyboard focus; shell/desktop preferred).

## Acceptance

- [ ] Keybound action registered; default kit documents it
- [ ] Mode exit hook is a no-op when no mode (stable API)
- [ ] Unfocus: no TILE is `focusMetaWindow` after action (best-effort on Wayland)
- [ ] Explicit unfocus does not immediately re-focus last tile via hover/LFT
- [ ] Live X11 smoke; document Wayland residual if any

## Context

- Prefer stage key focus clear / desktop; avoid focus ping-pong with focus-on-hover.
- Do not invent selection modes here — only the exit hook.
