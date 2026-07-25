# Session layout + tab click (install survival)

**Date:** 2026-07-25  
**Plans:** [forge-daily-driver](../../plans/forge-daily-driver.md),
[forge-harden-and-session](../../plans/forge-harden-and-session.md)  
**Design:** [docs/DESIGN.md](../../../docs/DESIGN.md) (session layout + tab strip)  
**Open follow-up task:** [forge-daily-driver_session-layout-ghostty.md](../../tasks/forge-daily-driver_session-layout-ghostty.md)

## Why

1. **Install thrash** — disable/HUP wiped the tree; flat re-track left dual-head
   apps as full-height columns.
2. **Tab clicks** — strip stacked below global focus; needed a content click first.

## What shipped

- Portable forest `session-layout.js` (id, pid, wmClass/title, frame, monitor)
- Debounced last-good save; install flush before HUP (`SaveSessionLayout` + GetTree
  fallback); strict mon rehome; richness + post-enable hold
- Match: id → pid(+geo) → class+title → class+geometry → unique class
- Raise after restore; tab strip restack / `_activateFromTab`
- Tests + DESIGN + troubleshooting

## Not done (carry to open task)

- **Ghostty dual-window residual:** same pid, title churn; left Ghostty still
  can rehome wrong or end up **visually under** right Ghostty after install.
  See open task for acceptance + A/B plan.

## Key paths

- `lib/extension/session-layout.js`
- `lib/extension/window.js` — save/restore + rehome + raise
- `lib/extension/session-api.js` — `SaveSessionLayout`
- `scripts/forge/forge` — `save-session-layout`
- `scripts/forge/_lib.zsh` — flush before HUP
- `tests/unit/extension/session-layout.test.js`
