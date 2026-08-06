# forge-action-pipeline_ap4-command-commitlayout

**Status:** in progress  
**Plan:** [forge-action-pipeline](../plans/forge-action-pipeline.md)  
**Branch:** `plan/forge-action-pipeline`  
**Created:** 2026-08-06  
**Depends:** AP2 (commitLayout exists)  

## Goal

Migrate remaining **StructureChanged** / **SizeOnlyChanged** command handlers in
`lib/extension/command.js` (and obvious session-api non-quiet siblings) from bare
`renderTree(...)` to `wm.commitLayout(reason, { force })`.

Already migrated (do not regress): Move, Swap*, drag-end, session move/swap,
focus (afterFocus).

## Acceptance

1. command.js structure/size handlers that currently call `renderTree` use
   `commitLayout` (force true for interactive keybind path unless Cq is correct).
2. No double-commit introduced.
3. Focus paths still `afterFocus` only.
4. Unit tests green; update CommandHandler mocks/expectations as needed.
5. Optional: session-api non-quiet layout/size/float ops also use commitLayout
   when they are direct user/DBus structure (not quiet RunSteps M).

## In scope handlers (grep renderTree in command.js)

Typical list (verify live): FloatToggle, Split, layout toggles, window-reset-sizes,
workspace-toggle, stacked/tabbed toggles, merge, snap-layout-move,
showtab-decoration, etc.

## Out of scope

- AP5 live matrix
- Deleting public `renderTree`
- mon-order X11

## Session note

(overwrite each prompt)
