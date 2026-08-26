# forge-layout-slot-machines_sm7-overlay-all-hard — Overlay dies at all-hard

**Status:** done  
**Plan:** [forge-layout-slot-machines](../../forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.5** implementer  
**Depends:** **SM4 done** (all-hard barrier). **SM5 done** (focus after hard).  
**Completed:** 2026-08-16

## Goal

Apply overlay / spinner lifetime = ApplyEpoch through **all required
slots hard-done or hard-failed** (D043). Soft residual must not keep
the modal up. Group chrome A is **not** this slice.

## Acceptance

- [x] Chrome clear reason is all-hard (or apply error / cancel), not
      “soft-enter because quiet might be long”
- [x] Restack strips on clear (R032 class) stays
- [x] Soft may still run after clear
- [x] L0: clear at all-hard; not cleared mid-place
- [x] Tab click / hover-spinner product residuals stay on
      [tab planning](../../../tasks/forge-tab-work-planning.md)

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| Clear gate | `layout-apply-run.js` `_applyHardReadyResult` + hard-ready skip paths → `_clearChrome(run, "all-hard")` |
| Soft residual | soft phase no longer clears chrome (runs after clear) |
| Terminal clear | `_finish` still clears on error/cancel/`done` (idempotent) |
| Restack on clear | `session-api.js` `onChromeClear` → `_scheduleTabStripRestack` (unchanged) |

### Proven

```bash
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js
# 2 files / 58

npm test -- tests/unit/extension/layout-apply-slot.test.js \
  tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/action-pipeline.test.js \
  tests/unit/extension/layout-apply-chrome.test.js
# 4 files / 91
```

### Do not stomp (SM6 / tab)

- **SM6:** delete belt / continue-on-timeout / focus-only-as-ok. Keep
  all-hard chrome clear + restack-on-clear.
- **Tab D0:** group chrome A + hover-spinner product residuals after
  tip load / logout. Do not move overlay clear earlier than all-hard.

### Residual

- Belt still present (SM6).
- Host R036 cold still human logout. Do not claim R036 cold PASS.
- Tab click / strip UX re-verify on tip after Shell reload (planning).
- Nest mon=1 green still SM6 gate (SM4 residual).

## Session note

**2026-08-16 SM7 done (4.5).** Overlay clear reason `all-hard` at the
slot-machine barrier (D043). Soft residual no longer owns clear.

**Changed**
- `layout-apply-run.js`: `_clearChrome(run, "all-hard")` when hard-ready
  terminals (success, hard-failed continue, skip paths). Cancel path
  still finishes with cancel/error reason. Removed soft-enter /
  soft-skip / soft-end clear reasons.
- `layout-apply-chrome.js`: policy text = all-hard (D043).
- `docs/dev/contracts.md`: overlay clear = all-hard (SM7).
- Tests: clear reason `all-hard`; not cleared mid hard-ready wait.

**Unchanged**
- Restack on clear (session-api R032).
- Focus after all-hard (SM5). Soft still runs after clear.
- Belt (SM6). Group chrome A not implemented.
