# forge-layout-slot-machines_sm5-focus-after-hard — Focus after all-hard

**Status:** ready (do not start before SM4)  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.5 med**  
**Depends:** **SM4**

## Goal

Run profile open leaves + keyboard focus + D018 pin + D019 soft barrier
**after** all required slots are hard-done or hard-failed. Soft stays
residual, not a structure fixer.

## Acceptance

- [ ] No mid-open / mid-place focus on the product path
- [ ] Focus once after the all-hard barrier (including when some slots
      hard-failed — focus what landed)
- [ ] Soft barrier + heuristics file unchanged in spirit (D019 SE3)
- [ ] Pin still ~15s; reveal adopts (R026)
- [ ] Verify-once after soft still runs; it does **not** define `Done.ok`
      (SM2)
- [ ] L0: focus actions not emitted before all-hard; steal still corrects

## Context for the next agent

### Paths

`layout-apply-run.js` focus/soft phases · `layout-apply-settle.js`
`applyFocusSteps` / `runSoftFocusBarrierOnSignals` ·
`layout-open-leaf-pin.js` · `revealGroupChild`

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/action-pipeline.test.js
```

### Do not

- Soft-fix wrong mon / flat tabs
- Clear overlay here unless SM7 is batched by the orchestrator
- Reintroduce GetTree LTF sync (R014)

## Session note

**2026-08-16:** Drafted at SM0 lock. Blocked on SM4.
