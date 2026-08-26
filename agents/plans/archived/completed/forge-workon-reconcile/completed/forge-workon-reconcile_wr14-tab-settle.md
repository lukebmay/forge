# WR14 — Post-workon tab click / focus settle

**Plan:** [forge-workon-reconcile.md](../../forge-workon-reconcile.md)  
**Status:** Done (A/B AGREE)  
**Priority:** P1 (PRIORITY #1 next product)

## Problem

After a successful `forge workon <name>` apply (mass move + ensure_layout tabbed),
**tab chrome can be dead** and focus/raise settle incomplete:

- Clicks on tabs do nothing until a content click first (classic restack bug).
- Active tab strip may sit under windows after RunSteps quiet batch.
- Plan risk: “Tab chrome dead after mass move → WR14 settle pass.”

Algorithm step 8 already says: *Apply (+ optional settle focus / tab chrome)*.

## Goal

After reconcile apply (and after post-open replan apply), run a **settle pass** so:

1. Tab decorations for touched groups restack above their windows (clickable).
2. Focus/raise is coherent for at least one role window per tabbed slot (or primary).
3. No extra launches; no tree structure thrash; second `workon` still no-op when perfect.

## Likely approach

Prefer minimal, tested changes:

| Layer | Option |
| --- | --- |
| Extension | After RunSteps unfreeze+render, restack tab decorations for TABBED CONs on active WS (or call existing decoration restack helpers). |
| CLI | After extension steps, optional focus steps for first claimed role per tab group / `focus` on roleOrder first. |
| Both | RunSteps end already `renderTree("run-steps")`; ensure quiet `_moveOp`/`_layoutOp` leave chrome restackable, or add settle in session-api after batch. |

Investigate existing: `DecorationManager._restackDecorationAboveGroup`, `updateTabbedFocus`, tree `_activateFromTab`, session-layout restore raise path, `bug-tab-click-activate.test.js`.

## Acceptance

- [x] After apply that creates/repairs tabbed groups, tab strip receives clicks without requiring a content click first (unit/regression test preferred; live smoke if possible).
- [x] Settle does not open apps or change role claim plan.
- [x] `npm test` / unit tests for touched pure + extension paths pass.
- [x] No regression in `bug-tab-click-activate` / related restack tests.
- [x] Brief plan + task session note.

## Non-goals

- WR6 full live black trial matrix  
- `--clean` (WR15)  
- Multi-line tabs (T9)

## Session note

**WR14 B verify — AGREE.** A’s fix is correct: post-`RunSteps` settle idle
(FIFO after render idle) raises tab/stack focus then chrome; focus-update
queue reordered raise→decoration. No launches/claim thrash; freeze/empty
guards OK. B tiny fix: track `_runStepsSettleSrcId`, clear on `disable()` /
re-schedule; skip settle if `wm.disabled`. Tests: tab-click (5), d5mm (2),
run-steps (20), lqe5 stacked (3) green. Residuals: live WR6 smoke; STACKED
`render-focus-stack` queue (existing); nested leaf under non-TABBED parent
may no-op `updateTabbedFocus` (workon tabs are flat).
