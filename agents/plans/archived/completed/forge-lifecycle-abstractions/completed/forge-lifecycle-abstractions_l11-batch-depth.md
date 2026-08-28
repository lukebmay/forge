# forge-lifecycle-abstractions_l11-batch-depth — pure LayoutBatchDepth

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Updated:** 2026-08-10

## Goal

L11: pure nestable open-layout batch depth + deferred-commit latch (CL5), unit-tested without GObject.

## Shipped

- `lib/extension/layout-batch-depth.js` — `LayoutBatchDepth` (`begin` / `end` / `latchCommit` / `clearNeedsCommit` / `reset` / `snapshot`)
- `tests/unit/extension/layout-batch-depth.test.js` (10)
- WM: `this._layoutBatch`; begin/end/requestLayout use it
- Compat getters/setters: `_openLayoutBatchDepth`, `_openLayoutBatchNeedsCommit` (tests + layout-controller + session-api)

## Acceptance

- [x] Pure state machine + unit tests
- [x] Nested end only commits on last leave with latch
- [x] Open-commit / session-api batch tests green
