# forge-layout-in-process_al6-executor-open — Launch + map on signals

**Status:** done  
**Plan:** [forge-layout-in-process](../../forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. Do not simplify D034/D035.

## Goal

Open phase in-process: spawn + PlaceNext, wait map/windowId on Meta
signals (admit + census + title-then-class pin), residual replan.

## Acceptance

- [x] Shared port of `open_action_to_launch_fields` / ghostty
      rewrite / chrome-family serialize (D034)
- [x] GJS spawn + PlaceNext facade; **no** CLI-launch fallback
- [x] Map wait uses `admitUntrackedWindows` + Meta census (D035) +
      OpenCommitManager / window-attach signals — not GetTree poll
- [x] Title wait then class-only leftover assign (D034)
- [x] Chrome-family opens serialized (D034)
- [x] Residual `planReconcile` with `rolePins` / `justOpenedRoles`
- [x] LayoutBatch: begin → opens → release-deferred → end **before**
      residual structure
- [x] L0 unit tests (launch fields + open bag mocks)
- [ ] Nest/host `_forge-test-*` open path — **not run** this session

## Context for the next agent (complete + succinct)

### What executes

| Piece | Path / symbol |
| --- | --- |
| Pure launch + pin | `lib/shared/layout-open.js` |
| Chrome family | `lib/shared/layout-plan.js` `isChromeFamilyClass` / `classEq` (exported) |
| Open bag | `lib/extension/layout-apply-open.js` — `startOpenPhase`, `waitPinsOnSignals` |
| Run bag | `LayoutApplyRunBag` `open` deps; hold/resume on async map-wait |
| Session | `_layoutApplyOpenDeps` — GJS spawn, `wm.placeNext`, admit, census, LayoutBatch, Meta `window-created` + `notify::title` / `notify::wm-class` |

Flow with opens:

1. Chrome show (AL4) + skeleton (AL5)
2. `beginOpenLayoutBatch` → PlaceNext + spawn per D034 (chrome serialized)
3. Map wait: admit + census on Meta signals; title then class leftover
4. `releaseDeferredOpens` → `endOpenLayoutBatch`
5. Residual `planReconcile` with `rolePins` / `justOpenedRoles`
6. Residual bind/order/size; hard-ready/soft still AL7 stub
7. Required-role miss fails after residual (`code=open-miss`)

Without `open.spawn` deps, AL5 deferred behavior stays (tests).

### Tests

```bash
npm test -- tests/unit/shared/layout-plan-normalize.test.js \
  tests/unit/shared/layout-plan-reconcile.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-structure.test.js \
  tests/unit/extension/layout-apply-open.test.js
# 125 pass
```

### Nest retest (not run this session)

```bash
./install --kit=vim
forge nested run --monitors=1 -- forge ping
```

CLI still owns live `forge layout` (AL8). Do not drive personal `dev`/`t1`.

### Residual for AL7

- Hard-ready / soft / focus / verify on Meta signals
- Belt moves-only (D014)
- No GetTree poll twin of `wait_until_hard_ready`

### Risks

- GJS desktop resolve (`DesktopAppInfo.search`) is not a full XDG
  walk; argv/ghostty path is explicit
- Chrome serialize wait shares the pin timeout budget
- Focus/soft still stub — late activate still AL7

## Session note

**2026-08-15:** AL6 open/map landed. L0 green (125). Nest live not
run. No commit (orchestrator may commit). Next: **AL7** settle.
