# forge-layout-slot-machines_sm1-apply-epoch — Named ApplyEpoch

**Status:** done  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.5 high**. Locked spec — do not redesign D039–D043.  
**Depends:** SM0 **done**  
**Completed:** orchestrator session 2026-08-16 (fresh Wayland host); L0 55 green

## Goal

Replace ad-hoc `_layoutApplyLive` with a named **ApplyEpoch / home
authority** (D039). During apply, desired forest is the only writer of
mon membership and TILE home.

## Acceptance

- [x] `beginApplyEpoch(run)` / `endApplyEpoch(run)` (or equivalent named
      API on a small module — **not** another boolean field on
      `WindowManager` as the contract)
- [x] Enter: suppress entered-monitor rehome; **drop** deferred rehomes
      (no flush)
- [x] Leave: drop deferred rehomes; Meta→tree mon align already in tree
      may stay if it is the epoch-end align
- [x] Workareas / monitors-changed during epoch → **cancel** the apply
      (`code: displays-changed`). Do not interleave H1
- [x] D026 `_restoreTileToSlot` / unsolicited restore is **idle-only**
      (skip while epoch live or grab)
- [x] Session restore, shield, GRAB_TILE remain separate epochs (do not
      collapse into ApplyEpoch)
- [x] Callers: ApplyLayout start/Done (`onApplyLive` / session-api wire)
- [x] L0: begin drops pending rehomes; end drops; workareas-during → cancel
- [x] No slot-machine runtime. No belt delete. No tab chrome rewrite

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| Named API | `lib/extension/layout-apply-epoch.js` — `ApplyEpoch`, `begin`/`end`, `policyOnDisplaysChangedDuringApply`, `shouldAllowIdleTileRestore` |
| WM facade | `window.js` `beginApplyEpoch` / `endApplyEpoch` / `isApplyEpochLive` / `setApplyEpochCancelHook` / `notifyDisplaysChangedDuringApply` |
| Wire | `session-api.js` `onApplyLive` → begin/end; cancel hook → `bag.cancel(..., { code })` |
| Run bag | `layout-apply-run.js` `cancel(id, { code })`, `_cancelOutcome` |
| D026 | `window.js` `_shouldRestoreTileSlot` / `_restoreTileToSlot` idle gates |
| Workareas | `monitor-recovery.js` `queueMonitorRecoveryOnWorkareas` skip H1 + cancel |

### Prefer

New `lib/extension/layout-apply-epoch.js` (pure helpers + snapshot) and a
thin WM facade. Extend the named API; do not add `_layoutApplyLive2`.

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-epoch.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js
```

Add focused L0 for epoch begin/end + displays-changed cancel.

### Do not

- Start SM4 machines
- Port planner to `cli/`
- Call `_layoutOp`
- Claim R036 cold PASS (human logout still required)
- Redesign home authority (D039 is locked)

## Session note

**2026-08-16 SM1 done (4.5 high).** Status: **ready** for orchestrator review.

**Changed**
- `lib/extension/layout-apply-epoch.js` (new): `ApplyEpoch`, `isApplyEpochLive`, `shouldAllowIdleTileRestore`, `policyOnDisplaysChangedDuringApply`, `APPLY_EPOCH_DISPLAYS_CHANGED`, `cancelErrorForCode`
- `window.js`: removed `_layoutApplyLive` / `setLayoutApplyLive`; added `beginApplyEpoch` / `endApplyEpoch` / `isApplyEpochLive` / cancel-hook + `notifyDisplaysChangedDuringApply`; rehome gates + D026 idle-only
- `session-api.js`: `onApplyLive` → begin/end; wires `setApplyEpochCancelHook` → `bag.cancel(id, { code: displays-changed })`; Meta→tree mon align on leave kept
- `layout-apply-run.js`: `cancel(id, opts.code)`; `_cancelOutcome`; Done code `displays-changed`
- `monitor-recovery.js`: real workareas mid-apply → cancel apply, **no H1** (R016 noop still first)

**Proven (all green)**
```
npm test -- tests/unit/extension/layout-apply-epoch.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js
# 3 files / 55 tests pass (epoch 6 + run 29 + H1 20)
```

**Residual risks**
- Host R036 cold still needs logout to load this tip (Wayland)
- True workareas **noop** does not cancel; non-noop workareas mid-apply always cancel (homes mid-migrate may make dock bounce look non-noop — intentional D039)
- Session restore / shield / GRAB_TILE flags unchanged (separate from ApplyEpoch)

**SM2 must not stomp**
- Do not reintroduce `_layoutApplyLive` boolean as the contract
- Hard-ready / `windowIsSettled` / Done.ok product path is SM2 — leave apply-epoch cancel wire alone
- `onApplyLive` still the bag hook name; WM API is begin/end
