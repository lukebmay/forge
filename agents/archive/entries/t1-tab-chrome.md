# T1 — Tab chrome reliability (no empty gap)

**Date:** 2026-07-24  
**Plan:** forge-daily-driver  
**Tags:** tiling, tabs, decoration

## Why

Users saw real missing stack/tab labels: one-of-N, or a reserved bar height with
desktop showing through. Root cause was treating labels as optional while always
reserving bar space when showtab was on — especially when `Shell.App` was null
at map time.

## What shipped

- Fallback tab when `!app` (generic symbolic icon + title/wm_class/`"Window"`).
- `_tabFallback` + `refreshApp` upgrade when the app resolves (late wm_class).
- Self-heal: STACKED/TABBED `processNode` ensures every tiled child has a tab;
  `_applyDecorationRect` one-shot ensure before attach.
- Same path for STACKED and TABBED (shared chrome).

## Key paths

- `lib/extension/tree.js` — `_buildTabBase`, `_createWindowTab`, `_ensureConTab`,
  `_getTitle`/`_titleForMeta`, `refreshApp`, `processNode`, `_applyDecorationRect`
- `tests/regression/bug-t1-tab-chrome-null-app-multiwindow.test.js`

## Not done here

- Multi-line tabs (T9), live blank/wake (T3), install trial on black.
