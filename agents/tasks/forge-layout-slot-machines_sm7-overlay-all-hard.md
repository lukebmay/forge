# forge-layout-slot-machines_sm7-overlay-all-hard — Overlay dies at all-hard

**Status:** ready (do not start before SM4)  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.5 med**  
**Depends:** **SM4** (all-hard barrier exists)

## Goal

Apply overlay / spinner lifetime = ApplyEpoch through **all required
slots hard-done or hard-failed** (D043). Soft residual must not keep
the modal up. Group chrome A is **not** this slice.

## Acceptance

- [ ] Chrome clear reason is all-hard (or apply error / cancel), not
      “soft-enter because quiet might be long”
- [ ] Restack strips on clear (R032 class) stays
- [ ] Soft may still run after clear
- [ ] L0: clear at all-hard; not cleared mid-place
- [ ] Tab click / hover-spinner product residuals stay on
      [tab planning](./forge-tab-work-planning.md)

## Context for the next agent

### Paths

`layout-apply-run.js` `_clearChrome` · `layout-apply-chrome.js` ·
R027 tests · `session-api-layout-cycle`

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js
```

### Do not

- Implement option A group chrome
- Start tab D0 code
- Block pointer after all-hard

## Session note

**2026-08-16:** Drafted at SM0 lock. Tab D0 waits on this gate.
