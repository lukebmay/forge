# forge-layout-slot-machines_sm2-in-slot-hard — In-slot hard + forest-match Done.ok

**Status:** done  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.6 high**. Contract change — keep D040/D041.  
**Depends:** SM0 **done**. **SM1 done** (ApplyEpoch landed).  
**Completed:** orchestrator session 2026-08-16; L0 settle+run 68 + SM1 suites green

## Goal

Hard-ready means the window is **in the desired slot**, not TILE
somewhere. `Done.ok` is a **required forest match**. Hard timeout must
not continue the product path as success.

## Acceptance

- [x] `windowIsSettled` / hard-ready grows an **in-slot** variant used by
      ApplyLayout: TILE\|grab + desired mon + desired parent CON + ε rect
- [x] TILE on the wrong mon is **pending**, not settled
- [x] Hard timeout no longer `_applyHardReadyResult` warn-and-`ok: true`
      as the terminal success path. Record pending; do not mark the run
      successful because focus later passed
- [x] `_finishSpine` / Done: `ok: false`, `code: hard-failed` when any
      **required** TILE slot is not in-slot (named list in result)
- [x] Focus-only verify is **not** the `ok` definition (may still run)
- [x] FLOAT / `ignore` / non-tile roles are not required hard targets
- [x] Retry loop is **SM4**. This slice may expose “pending after one
      wait” without implementing N=2 retries
- [x] L0: wrong-mon TILE pending; empty required mon fails Done; timeout
      is not success
- [x] No PlaceNext dest change (SM3). No belt delete (SM6)

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| Predicate | `lib/extension/layout-apply-settle.js` `windowIsSettled` / `hardReadyStatus` |
| Slot targets | `collectHardReadySlotTargets` / `matchRequiredTileSlots` |
| Timeout continue | `layout-apply-run.js` `_applyHardReadyResult` (records pending; spine continues) |
| Done | `layout-apply-run.js` `_finishSpine` → `code: hard-failed` + `result.hardFailed` |
| Forest | snapshot + `planReconcile` expected vs live |
| Tests | `tests/unit/extension/layout-apply-settle.test.js` · `layout-apply-run.test.js` |

### Keep

Existing loose `windowIsSettled` for **non-apply** launch waits if those
callers only need “has a TILE somewhere.” ApplyLayout must use the
in-slot predicate. Extend the named helper; do not fork a twin in
`session-api.js`.

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js
```

### Do not

- Implement slot-machine runtime (SM4)
- Flip `ok` true on required hard-fail (D041)
- Touch `window.js` rehome if SM1 is in flight
- GetTree poll twins

## Session note

**2026-08-16 SM2 done (4.6 high).** Status: **ready** for orchestrator review.

**Changed**
- `layout-apply-settle.js`: `windowIsSettled` / `hardReadyStatus` accept in-slot
  fields (`monitor`, `parentId`/`parentLayout`/`parentType`, `slotRect` ε).
  New: `collectHardReadySlotTargets`, `matchRequiredTileSlots`,
  `windowSlotContextById`, `mergeWindowSlotContext`, `isRequiredTileRole`,
  `desiredMonitorFromSlot`. Loose callers unchanged (no slot opts).
- `layout-apply-run.js`: ApplyLayout hard-ready uses slot targets.
  `_applyHardReadyResult` timeout records `hardPending` and continues the
  spine (`not success`); `_finishSpine` sets `ok: false`,
  `code: hard-failed`, `result.hardFailed` (named slots) when required
  TILE slots are not in-slot. Focus/soft/verify still run. FLOAT/ignore
  skipped.

**Proven (all green)**
```
npm test -- tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js
# 2 files / 68 tests (settle 36 + run 32)

npm test -- tests/unit/extension/layout-apply-epoch.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js
# 3 files / 58 tests (epoch 6 + run 32 + H1 20)
```

**Residual**
- N=2 hard retry is **SM4**. This slice is “pending after one wait.”
- Unopened roles (no windowId / no pins) are not hard targets — empty-clean
  deferred-open still `ok` until open-miss. Empty dest mon with **claimed**
  TILE roles fails Done.
- Host R036 cold still needs logout (human).

**SM3/SM4 must not stomp**
- Do not treat TILE-anywhere as ApplyLayout hard-ready.
- Do not `_finish(true)` when `result.hardFailed` is non-empty.
- Do not flip `ok` true because verify/focus passed.
- Leave ApplyEpoch begin/end + displays-changed cancel wire (SM1).
- SM3: PlaceNext dest only. SM4: consume `collectHardReadySlotTargets` /
  `matchRequiredTileSlots`; do not fork a second in-slot predicate.
