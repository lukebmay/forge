# forge-lifecycle-abstractions_l8-open-commit-manager — OpenCommitManager extract

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Updated:** 2026-08-10  
**Depends:** A1 open-commit SourceBag wire; L11 optional (done same session)

## Goal

L8: extract open-commit pending map + SourceBag arm/cancel/fire ownership into a manager after bag wire (not more pure invention).

## Shipped

- `lib/extension/open-commit-manager.js` — `OpenCommitManager` (schedule/cancel/cancelAll/arm/touch/slot/snapshot)
- Pure quiet policy remains in `layout-open.js`
- Product fire/commit stays on WM `_fireOpenCommit` via `onFire`
- WM: `this._openCommit`; inject still `_openCommitSchedule` / `_openCommitCancel`
- Compat getters: `_openCommitPending`, `_openCommitSources`
- `tests/unit/extension/open-commit-manager.test.js` (8) + existing open-commit suite green

## Acceptance

- [x] Manager owns bag + pending; no dual field timer ownership
- [x] Catalog / commitLayout / queueEvent still on WM
- [x] Unit + WindowManager-open-commit green

## Dump

```text
wm._openCommit.snapshot()
// or wm._openCommitSources.snapshot()
```
