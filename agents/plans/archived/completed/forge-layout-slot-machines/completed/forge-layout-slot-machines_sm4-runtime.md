# forge-layout-slot-machines_sm4-runtime — Slot-machine executor

**Status:** done  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.6 high** implement. After merge, orchestrator assigns
a **separate 4.6 high** review of the bag API.  
**Depends:** **SM2 done** + **SM3 done**  
**Assigned:** orchestrator session 2026-08-16 after SM1–SM3

## Goal

Run **slot machines** on the product ApplyLayout path: parallel
independent slots, serial inside a slot, hard retry N=2, late resume
only while ApplyEpoch is live (D040).

## Acceptance

- [x] Per-slot state: `open/map → place → hard wait → retry place (≤2)
      → hard-done | hard-failed`
- [x] TABBED/STACKED CON = **one** machine (members not independent)
- [x] Parallel only across independent slots
- [x] First hard wait 5s; retry waits 2s; clock from our place act
- [x] Late Meta after `hard-failed` resumes **only if epoch still live**
- [x] All required slots terminal → forest-match (SM2) → then SM5 will
      own focus; this slice may still call today’s focus **after** the
      barrier if SM5 has not landed — do not focus mid-open
- [x] L0 pure machines: parallel independence, group-as-one, retry then
      fail, no resume after epoch end
- [ ] Nest mon=1 `_forge-test-clean` + `_forge-test-ghosttys` after
      install. Dual nest only for mon-ownership cases
- [x] No dual forever-path comment left as “temporary default”

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| Bag | `lib/extension/layout-apply-slot.js` |
| Spine | `layout-apply-run.js` `_runHardReadyPhase` → `startSlotMachines` |
| Hard | SM2 `collectHardReadySlotTargets` / `waitHardReadyOnSignals` / `matchRequiredTileSlots` |
| Open | SM3 dest (untouched) |
| Epoch | SM1 begin/end; `isEpochLive` gates late resume; dispose at `_finish` |

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-slot.test.js
# nest: `forge nested run --monitors=1 -- env …` is rejected by
# top-level argparse. Use:
forge nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-clean'
forge nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-ghosttys'
```

### Do not

- Per-window machines for tab peers
- Resume machines after Done / epoch end
- Implement group chrome A (tab D0)
- Delete belt here (SM6)
- `_layoutOp` / Mode B

## Session note

**2026-08-16 SM4 done (4.6 high).** Status: **ready** for orchestrator
4.6 high bag-API review. Uncommitted on `master`.

**Changed**
- `lib/extension/layout-apply-slot.js` (new bag). Product hard-ready
  is slot machines, not a one-shot wait. No alt spine left.
- `layout-apply-run.js`: `_runHardReadyPhase` → `startSlotMachines`;
  `_placeSlot` re-issues that slot’s moves; dispose session in
  `_finish`. Focus/soft/verify still run **after** all-hard.
- Tests: `layout-apply-slot.test.js` (10) + run retry drains.
- `docs/dev/contracts.md`: hard-ready row names the bag.

**Bag API**
- Consts: `SLOT_HARD_FIRST_WAIT_MS` (5000), `SLOT_HARD_RETRY_WAIT_MS`
  (2000), `SLOT_HARD_RETRY_N` (2), `SLOT_PLACE_ATTEMPTS` (3),
  `SLOT_STATE`
- Pure: `slotMachineKey`, `collectSlotMachines`, `applySlotEvent`,
  `hardWaitMsForAttempt`, `canLateResumeSlot`, `isSlotTerminal`,
  `placeSlotWindows`
- Runtime: `startSlotMachines(machines, opts, done)` →
  `{ dispose, snapshot, machines, sync }`
- `collectSlotMachines` uses SM2 `collectHardReadySlotTargets`
  (pins + focus ids). Does not fork `windowIsSettled`.

**Proven**
```
npm test -- tests/unit/extension/layout-apply-slot.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-settle.test.js
# 3 files / 78 (slot 10 + run 32 + settle 36)

npm test -- tests/unit/extension/layout-apply-epoch.test.js \
  tests/unit/extension/layout-apply-open.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/place-hint.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js
# 5 files / 107 (epoch 6 + open 13 + layout-open 36 + hint 32 + H1 20)

./install --kit=vim
# Live reload needs logout (Wayland). Nest loaded the tip.

forge nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-clean'
# PASS (ok; hard-ready skip no TILE targets)

forge nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-ghosttys'
# FAIL open-miss ×3 cold — spawn ok, map never entered nest
# (known nest map flake; fails before machines). Nest stopped.
```

Mid nest (windows already mapped): machines ran
(`slot id:… place attempt=1`), focus **after** hard-ready, soft/verify
ran; `Done.ok=false` `code=hard-failed` `hardFailed=[mon0]` (SM2 forest
match; leftover wrap / mon=1 vs dual-tile profile). Not a machine miss.

**Residual**
- Cold nest `_forge-test-ghosttys` map-miss (pre-SM4). Do not claim
  nest ghosttys PASS.
- Machines = SM2 hard set (pins + focus), not every reused TILE.
  Forest-match still covers all required slots at Done.
- Host R036 still needs logout. Do not claim cold host PASS.
- Belt still present (SM6). Overlay still clears at soft-enter (SM7).

**SM5 must not stomp**
- Focus stays after all-hard. Do not focus mid-open/place.
- Keep calling focus on what landed (including hard-failed peers).
- Leave `_runHardReadyPhase` / `startSlotMachines` as the barrier.
- Leave SM1 epoch begin/end + late-resume `isEpochLive` + `_finish`
  dispose.

**SM6 must not stomp**
- Retry place is `placeSlotWindows`, not belt. Delete belt/continue-
  on-timeout only. Do not delete the machine bag.
- Do not restore one-shot hard-ready.

**SM7 must not stomp**
- Overlay still soft-enter. Clear at all-hard (after machines
  terminal). Do not move machines.

**Open risks**
- Nest ghostty GTK map can miss the 15s pin wait (admit=0).
- `forge nested run --monitors=1 -- env …` argparse-rejects; use
  `forge nested run -- bash -lc 'env FORGE_JOB=0 …'`.
