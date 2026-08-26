# forge-layout-in-process_al7-executor-settle — D019 in-process

**Status:** done  
**Plan:** [forge-layout-in-process](../../forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. Do not add a JS GetTree poll.

## Goal

Hard-ready, focus once, soft residual, verify once, optional belt —
all inside the extension on Meta signals + existing bags.

## Acceptance

- [x] Hard-ready: shared settled predicate; ~5s call clock; Meta
      TILE/rect/mon signals (`layout-sensors` attribution)
- [x] Focus once: `revealGroupChild` + `pinLayoutOpenLeaf` (D018)
- [x] Soft: `settle-math` quiet; steal → pin restore + reset quiet
- [x] Heuristics write under `forgeConfigHome` (same file shape)
- [x] Verify once; correct at most once
- [x] Belt = D014 pin-role wrong-mon **moves only**
- [x] LF6 `waitTreeStable` stays opt-in
- [x] No function that polls GetTree / `wait_until_hard_ready` clone
- [x] Chrome stays up through soft; clears after verify/terminal
- [ ] Nest/host `_forge-test-*` — **not run** this session

## Context for the next agent (complete + succinct)

### What executes

| Piece | Path / symbol |
| --- | --- |
| Predicates + waits | `lib/extension/layout-apply-settle.js` |
| Formula | `lib/extension/settle-math.js` (unchanged) |
| Run bag | `LayoutApplyRunBag` `settle` deps |
| Session | `_layoutApplySettleDeps` — Meta size/pos/focus/mon signals, `forgeConfigDir()/settle-heuristics.json` |
| Focus | existing RunSteps `focus` → `_focusOp` → `revealGroupChild` + pin (D018/D025) |
| Soft correct | pin `restoreLayoutOpenLeafIfStolen` + same focus steps |
| Belt | `runBeltMovesOnly` → `planReconcile` + pin-role **moves only** |

Flow after AL6 residual structure:

1. **hard-ready** — `waitHardReadyOnSignals` (event + one 5s timer; no poll). Timeout **warns**, continues (Python product).
2. **focus** — existing structure steps once (reveal + pin).
3. **soft** — `runSoftFocusBarrierOnSignals`; steal → restore pin + reveal + reset quiet; heuristics record.
4. **verify** — `focusActionsStillNeeded` → correct at most once; then D014 belt moves if `rolePins`.
5. Chrome clears in `_finish` (after verify / terminal). Heuristics flush unless cancel-before-wait.
6. `flags.waitTreeStable` only → `waitTreeFingerprintQuietOnSignals` (opt-in LF6).

Hard-ready IDs = role pin ids + focus-action ids.

### Tests

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-structure.test.js \
  tests/unit/extension/layout-apply-open.test.js \
  tests/unit/extension/layout-apply-settle.test.js
# 157 pass (settle 27 + run 24; AL1–AL6 guards unchanged)
```

### Nest retest (not run this session)

```bash
./install --kit=vim
forge nested run --monitors=1 -- forge ping
```

CLI still owns live `forge layout` (AL8). Do not drive personal `dev`/`t1`.

### Residual for AL8

- Thin client: load profile → `ApplyLayout` → stream Progress/Done
- Delete Python `wait_until_hard_ready` / `run_soft_*` / `_layout_final_focus_pass`
- Live `_forge-test-*` sign-off before deleting waiters
- Close IC4 as skipped

### Risks

- Hard-ready timeout is warn-and-continue (matches CLI). Soft max-corrections fails the run.
- First-ever soft timeout is the learning cap (~6s); cold pins raise the floor to 2s.
- Nest/host ApplyLayout settle not proven this session.

## Session note

**2026-08-15:** AL7 L0 closed. Session already had settle bag +
`_layoutApplySettleDeps` (Meta size/pos/mon/focus, heuristics under
`forgeConfigDir()`, restore via `restoreLayoutOpenLeafIfStolen`,
focus via existing `revealGroupChild`+pin). Added
`layout-apply-settle.test.js` (27) and run-bag hard→soft→verify
path (not only `no-settle-deps` skip). Suite **157**. Nest not run.
No commit. Next: **AL8** thin CLI after `_forge-test-*` live.
