# forge-layout-slot-machines_sm1-apply-epoch — Named ApplyEpoch

**Status:** ready  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.5 high**. Locked spec — do not redesign D039–D043.  
**Depends:** SM0 **done**

## Goal

Replace ad-hoc `_layoutApplyLive` with a named **ApplyEpoch / home
authority** (D039). During apply, desired forest is the only writer of
mon membership and TILE home.

## Acceptance

- [ ] `beginApplyEpoch(run)` / `endApplyEpoch(run)` (or equivalent named
      API on a small module — **not** another boolean field on
      `WindowManager` as the contract)
- [ ] Enter: suppress entered-monitor rehome; **drop** deferred rehomes
      (no flush)
- [ ] Leave: drop deferred rehomes; Meta→tree mon align already in tree
      may stay if it is the epoch-end align
- [ ] Workareas / monitors-changed during epoch → **cancel** the apply
      (`code: displays-changed`). Do not interleave H1
- [ ] D026 `_restoreTileToSlot` / unsolicited restore is **idle-only**
      (skip while epoch live or grab)
- [ ] Session restore, shield, GRAB_TILE remain separate epochs (do not
      collapse into ApplyEpoch)
- [ ] Callers: ApplyLayout start/Done (`onApplyLive` / session-api wire)
- [ ] L0: begin drops pending rehomes; end drops; workareas-during → cancel
- [ ] No slot-machine runtime. No belt delete. No tab chrome rewrite

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| Flag today | `window.js` `_layoutApplyLive` / `setLayoutApplyLive` / `_onWindowEnteredMonitor` |
| Wire | `session-api.js` `onApplyLive` |
| Run bag | `layout-apply-run.js` enter/leave |
| D026 restore | `layout-sensors.js` / `window.js` `_restoreTileToSlot` |
| Workareas | `workareas-policy.js` / `monitor-recovery.js` |

### Prefer

New `lib/extension/layout-apply-epoch.js` (pure helpers + snapshot) and a
thin WM facade. Extend the named API; do not add `_layoutApplyLive2`.

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-run.test.js \
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

**2026-08-16:** Drafted at SM0 lock. Ready for 4.5 high.
