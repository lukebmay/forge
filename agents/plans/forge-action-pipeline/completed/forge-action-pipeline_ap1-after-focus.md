# forge-action-pipeline_ap1-after-focus

**Status:** done  
**Plan:** [forge-action-pipeline](../plans/forge-action-pipeline.md)  
**Branch:** `plan/forge-action-pipeline`  
**Created:** 2026-08-06  
**Completed:** 2026-08-06  

## Goal

Introduce `wm.afterFocus(node, opts)` as the **only** FocusChanged body
(**F → Dfocus → B → P → A**) and migrate all focus entries.

Formulas: [docs/dev/actions.md](../../docs/dev/actions.md)  
API: `lib/extension/action-pipeline.js` + `WindowManager.afterFocus`.

## Acceptance

1. [x] All focus entries call `afterFocus` only (no inline F+D+B lists at call sites).
2. [x] No `renderTree` on ordinary focus; no **Dfull** on focus.
3. [x] Double-call idempotent; cross-mon no hide other strip.
4. [x] Unit: WindowManager-focus + decoration scope + pipeline tests green.
5. [ ] Optional: shorten 220ms focus queue to idle-0 — **deferred** (justified).

## Session note

**2026-08-06 — A/B AGREE wrap-up**

### Shipped
- `lib/extension/action-pipeline.js`: `afterFocus(wm, node, { source, forcePointer })`
- `WindowManager.afterFocus` thin delegate
- Migrated: Meta focus-update, overview hide, command Focus/FocusNext/Prev,
  tab click, DBus `_focusOp`
- Tests: `tests/unit/extension/action-pipeline.test.js` + focus/command/tab updates
- **`npm test`**: 201 files, 2194 passed (A + B re-run)

### Not in scope (left alone)
- Structure settle (AP2): Move/Swap/drag
- RunSteps settle, session restore, rehome grab path

### Optional item 5
- Deferred: keep 220ms Meta coalesce; tab-click already immediate afterFocus

### Next
- AP2: Structure one-commit (Move/Swap/drag)
