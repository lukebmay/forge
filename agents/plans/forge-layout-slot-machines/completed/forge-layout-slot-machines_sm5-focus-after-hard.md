# forge-layout-slot-machines_sm5-focus-after-hard — Focus after all-hard

**Status:** done  
**Plan:** [forge-layout-slot-machines](../../forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.5** implementer  
**Depends:** **SM4 done**  
**Completed:** 2026-08-16

## Goal

Run profile open leaves + keyboard focus + D018 pin + D019 soft barrier
**after** all required slots are hard-done or hard-failed. Soft stays
residual, not a structure fixer.

## Acceptance

- [x] No mid-open / mid-place focus on the product path
- [x] Focus once after the all-hard barrier (including when some slots
      hard-failed — focus what landed)
- [x] Soft barrier + heuristics file unchanged in spirit (D019 SE3)
- [x] Pin still ~15s; reveal adopts (R026)
- [x] Verify-once after soft still runs; it does **not** define `Done.ok`
      (SM2)
- [x] L0: focus actions not emitted before all-hard; steal still corrects

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| Phase order + gate | `layout-apply-run.js` `APPLY_LAYOUT_PHASES`, `focusAfterAllHardAllowed` |
| Focus / soft / verify | `_runPhaseWork` focus after hard-ready; soft; verify |
| Soft residual | `layout-apply-settle.js` `runSoftFocusBarrierOnSignals` |
| Place no focus | `layout-apply-slot.js` `placeSlotWindows` (moves only) |
| Pin 15s / adopt | `layout-open-leaf-pin.js` · `action-pipeline` `revealGroupChild` R026 |
| Done.ok | `_finishSpine` → `matchRequiredTileSlots` (not verify) |

### Proven

```bash
npm test -- tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/action-pipeline.test.js \
  tests/unit/extension/layout-apply-slot.test.js
# 4 files / 108
```

### Do not stomp (SM6 / SM7)

- **SM6:** delete belt / continue-on-timeout / focus-only-as-ok. Keep
  focus after all-hard and soft residual. Do not restore mid-open focus.
- **SM7:** overlay clear reason `all-hard` (still soft-enter today). Do
  not move focus earlier to “clear chrome sooner.”

### Residual

- Belt still at focus + verify force (SM6).
- Overlay still soft-enter (SM7).
- Host R036 cold still human logout.
- Nest ghosttys open-miss residual (pre-SM4; not SM5).

## Session note

**2026-08-16 SM5 done (4.5).** Audit post-SM4: product spine already ran
focus/soft/verify after `startSlotMachines`. Formalized SM5 gate + L0.

**Changed**
- `layout-apply-run.js`: `focusAfterAllHardAllowed`; focus/soft refuse
  before `hardReadyRan` when hard-ready is on the phase list; `focusRan`
  + header/L4.6 comments. Soft comment: residual only after all-hard.
- `layout-apply-settle.js`: bag header notes SM5 / verify ≠ Done.ok.
- `docs/dev/contracts.md`: Soft/focus after all-hard (SM5).
- Tests: phase order helper; SM5 no mid-open focus; hard-failed still
  focuses; `placeSlotWindows` never emits focus.

**Unchanged in spirit**
- Soft barrier + heuristics (D019 SE3).
- Pin `LAYOUT_OPEN_LEAF_PIN_MS` 15s; R026 adopt (action-pipeline tests).
- Verify-once after soft; Done.ok = forest-match (SM2).
- SM1 epoch, SM2 hard predicates, SM3 dest, SM4 machines barrier.
