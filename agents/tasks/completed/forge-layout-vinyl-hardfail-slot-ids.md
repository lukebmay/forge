# forge-layout-vinyl-hardfail-slot-ids — ApplyLayout hard-fail: slot IDs ≠ late-adopted windows

**Status:** done
**Plan:** (none) — host verify follow-up from OH / ws-orphan tip load
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

Make `forge layout` hard-ready track the **same** Meta windows that late
place-hint adopts, so forest-match `Done.ok` is honest after open+bind on a
cold workspace.

## Acceptance

- [x] Repro class fixed: late place-hint adopt remaps slot-machine window ids
      so machines don’t hard-fail on stale pre-adopt ids
- [x] Slot-machine `windowIds` after bind/open match windows visible in tree /
      place-hint late-adopt logs (remap + slot-keyed machines)
- [x] Job `hardReady.failed` empty when Meta geometry is in-slot; if still
      failing, DEBUG logs name **why** (mode / mon / parent / ε rect) per id
- [x] L0: unit/regression covering “late adopt remaps slot machine window id”
- [x] Nest: cold `_forge-test-clean` + `_forge-test-ghosttys` (mon=2) green;
      nest `running: False`

## Context for the next agent (complete + succinct)

### Root cause

Open/bind pinned roles to early Meta ids. Late place-hint adopt moved the
*correct* windows into PH slots (new ids). Slot machines kept watching the
stale pins → hard-timeout. Forest match (greedy identity) settled the new ids
while `hardReady.pending` still listed the old ones → false `hard-failed`.

### Fix

1. `slotMachineKey` prefers **slot** (D040: slots not windows)
2. `remapSlotMachineWindowId` / `syncSlotMachineRoleWindowIds`
3. `syncRolePinsFromForest` remaps **existing** open/bind pins only
4. Hard-wait uses live id/slot getters; `refreshMachineIds` on window events
5. Settle signals include `notify::wm-class` / `notify::title`
6. `windowSettleFailureReasons` + DEBUG `hard-ready why` on timeout
7. Forest match ignores stale `hardReady.pending` ids no longer in rolePins

### Paths

- `lib/extension/layout-apply-slot.js`
- `lib/extension/layout-apply-settle.js`
- `lib/extension/layout-apply-run.js`
- `lib/extension/session-api.js`
- `tests/unit/extension/layout-apply-slot.test.js`
- `tests/unit/extension/layout-apply-settle.test.js`

### Verify

```bash
npm test -- tests/unit/extension/layout-apply-slot.test.js \
  tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/place-hint.test.js
# 122 passed

./install --kit=vim
./scripts/forge/forge-test nested run --monitors=2 -- bash -lc \
  'env FORGE_JOB=0 forge layout _forge-test-clean && \
   env FORGE_JOB=0 forge layout _forge-test-ghosttys'
./scripts/forge/forge-test nested status   # running: False
```

### Residual

- Host vinyl WS2 still needs operator recreate + tip eyes-on (profile mon count
  is separate → [forge-layout-profile-preflight.md](../forge-layout-profile-preflight.md))
- Inkscape same-id rect-ε failures remain honest in-slot fails (DEBUG why)

## Session note

Shipped ID ownership fix (not a timeout band-aid). L0 **122** green. Nest
mon=2 clean+ghosttys **ok**; stopped. No commit/push.
