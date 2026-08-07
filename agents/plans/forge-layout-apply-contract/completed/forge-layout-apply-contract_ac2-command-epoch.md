# Task: forge-layout-apply-contract_ac2-command-epoch

**Status:** done  
**Plan:** [forge-layout-apply-contract.md](../../forge-layout-apply-contract.md)  
**Branch:** `plan/forge-layout-apply-contract`  
**Created:** 2026-08-07  
**Completed:** 2026-08-07  
**Depends:** AC1 done  
**Host:** black — unit tests only (Wayland; no live install/HUP)

## Goal

Replace stack-only `_suppressGeometrySignalRetile` as the **sole** self-echo filter
with a **per-window command epoch** (plan §7.2). During echo residual, geometry
signals must not `markUnsettled` the forest (and still must not `requestLayout` —
already true after AC1).

## Design (locked lean)

```text
waveId = beginWave()   // layout batch / explicit apply wave
  for each apply(W, slot):
    commandId = nextCommand(W)
    record expected: targetRect, t0
    move_resize(...)
    W.epoch = { waveId, commandId, until: t0 + residualMs, mode: "echo" }
endWave() when all roles terminal (or batch end + residual windows expire)
```

While `W.epoch.mode == "echo"` and `now < until`:

- may count toward residual / catalog (optional)
- **do not** `markUnsettled` forest for that window’s geom signals
- **do not** `requestLayout`
- chrome/border updates OK

After epoch ends without thrash isolation (AC4 later) → window considered
commanded+residual-done for settle purposes.

### Keep during AC2

| Piece | Role |
| --- | --- |
| `_suppressGeometrySignalRetile` during sync `move` / `tree.apply` | Still useful for **in-stack** re-entrancy; epoch covers **post-stack** client snap |
| LayoutBatch begin/end | Call `beginWave` / cooperate with wave lifecycle |
| `isForgeCausedGeometrySignal` | Extend or replace to check **suppress OR active echo epoch for that metaWindow** |

### Constants

- Named residual window, e.g. `COMMAND_ECHO_RESIDUAL_MS` (~250–500ms; pick one constant, document). Not multi-second Meta sleeps.
- Injectable clock for unit tests.

## Scope (in)

1. Module or methods for wave/command epoch state (on WM, LayoutController, or small `layout-epoch.js` — prefer small pure-ish helper + thin WM glue).  
2. On successful tile `move` / apply that commits a slot: start/refresh echo epoch for that Meta window.  
3. `updateMetaPositionSize` / external path: if window has active echo epoch → treat as Forge-caused (chrome only / no markUnsettled).  
4. Layout batch: beginWave at batch start (or first apply); endWave when batch residual complete or batch end + expiry. Minimal: wave id increments on batch begin; epochs keyed by window.  
5. Unit tests for:  
   - apply → later size-changed within residual → no markUnsettled  
   - after residual expires → external geom may markUnsettled (sensor path)  
   - stack suppress still works  
6. Docs: short note in architecture/rendering pointing at command epoch.

## Out of scope

- Placeholder / thrash float (AC4)  
- Streaming admit / LF6 drop (AC3)  
- Residual **nudge/center** (AC7)  
- Live smoke (AC6 deferred)  
- Removing `_suppressGeometrySignalRetile` entirely (keep as inner-stack belt)

## Acceptance

1. Geometry signal for a window with **active echo epoch** does not call `layoutController.markUnsettled` / does not go through “external” forest path.  
2. After residual Ms, same signal can markUnsettled (sensor) — no requestLayout (AC1).  
3. Stack suppress still prevents unsettle during synchronous move.  
4. Unit tests cover epoch start on apply + expiry.  
5. `npm test` / related suite green; no live HUP.  
6. Session notes on task + plan overwritten.

## FIRM rules

- Branch `plan/forge-layout-apply-contract` only.  
- No push, no SSH, no secrets.  
- No dual pixel-war path.  
- DESIGN-FLAW → stop.  
- High reasoning.

## Session note

**2026-08-07 Task Force A:** Implemented AC2 command epoch.

| Item | Detail |
| --- | --- |
| Module | `lib/extension/layout-epoch.js` — `LayoutCommandEpoch`, `COMMAND_ECHO_RESIDUAL_MS = 350` |
| Attribution | `isForgeCausedGeometrySignal` = stack suppress **OR** `layoutEpoch.isEchoActive(metaWindow)` |
| Apply hook | `wm.move` after successful `_moveImpl` → `startEcho(meta, { targetRect })` |
| Batch | `beginOpenLayoutBatch` → `layoutEpoch.beginWave()`; returns `waveId` |
| Clock | `setNow` / ctor `now` injectable |
| Tests | `layout-epoch.test.js` + sensors + bug-w-render-storm AC2 cases |
| Suite | `npm test` → 207 files / 2295 tests green |
| Docs | `architecture.md`, `rendering.md` |
| Commit | **not** by A (orchestrator after B AGREE) |

**Risks for AC3/AC4:** residual 350ms may be short for very slow client snap (catalog later); wave end does not clear epochs (time-only); no thrash budget yet (AC4).
