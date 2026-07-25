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

- Portable forest `session-layout.js` (Meta id leaves)
- **v1:** save on disable only — **failed on black** (HUP skip + cohort empty)
- **v2:** debounced last-good save; install flush (`SaveSessionLayout` + GetTree
  fallback); strict mon rehome before apply; keep file on match miss
- Tab restack / `_activateFromTab` (separate)
- Tests + DESIGN + troubleshooting

## Not done

- Full `workon` / named session profiles (forge-command FC5+)
- Live proof that second install keeps dual-head tabs on `black`

## Key paths

- `lib/extension/session-layout.js`
- `lib/extension/window.js` — save/restore + rehome
- `lib/extension/session-api.js` — `SaveSessionLayout`
- `scripts/forge/forge` — `save-session-layout` (GetTree fallback)
- `scripts/forge/_lib.zsh` — flush before HUP
- `tests/unit/extension/session-layout.test.js`
