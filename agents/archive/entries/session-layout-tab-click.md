# Session layout + tab click (install survival)

**Date:** 2026-07-25  
**Plans:** [forge-daily-driver](../../plans/forge-daily-driver.md),
[forge-harden-and-session](../../plans/forge-harden-and-session.md)  
**Design:** [docs/DESIGN.md](../../../docs/DESIGN.md) (session layout + tab strip)

## Why

1. **Install thrash** — disable→enable wiped the tree; flat re-track left dual-head
   apps as full-height columns on one monitor.
2. **Tab clicks** — strip stacked below global focus; needed a content click first.

## What shipped

- Portable forest `session-layout.js` (Meta id leaves); save on disable, restore on
  enable when same-boot / ≤30m / ≥50% match; clear after use
- Config I/O: `~/.config/forge/config/session-layout.json`
- Decoration restack above CON group actors; reactive tabs; `_activateFromTab`
- User troubleshooting + DESIGN notes; unit/regression tests

## Not done

- Full `workon` / named session profiles (forge-command FC5+)
- Live install trial proof on host `black` (user)

## Key paths

- `lib/extension/session-layout.js`
- `lib/extension/window.js` — save/restore hooks
- `lib/extension/decoration.js` — `_restackDecorationAboveGroup`
- `lib/extension/tree.js` — `_activateFromTab`
- `tests/unit/extension/session-layout.test.js`
- `tests/regression/bug-tab-click-activate.test.js`
