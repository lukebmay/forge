# forge-lifecycle-abstractions_w4-suppress-sites — SuppressFlag wire for sticky booleans

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** A5 pure SuppressFlag; W2/W3 residual sources done

## Goal

Replace sticky WM suppress booleans with `SuppressFlag` instances so throw/early
return cannot leave suppress stuck. **All readers must use `.active`** — a flag
object is always truthy.

## Scope (do)

| Concern | Old field | New | Wire pattern |
| --- | --- | --- | --- |
| Geometry retile | `_suppressGeometrySignalRetile` | `wm._suppressGeom` (`label: "geom"`) | `run(() => …)` or enter/leave around `move` / `tree.apply` |
| Above handler | `_suppressAboveHandler` | `wm._suppressAbove` (`label: "above"`) | `_withSuppressedAboveHandler` → `this._suppressAbove.run(fn)`; reader `.active` |
| Entered-monitor rehome | `_suppressEnteredMonitorRehome` | `wm._suppressRehome` (`label: "rehome"`) | enter/leave or run around apply/session-api; reader `.active` |

### Production readers (must use `.active`)

- `layout-sensors.js` `isForgeCausedGeometrySignal` — treat flag `.active` (and keep epoch path)
- `window.js` `_onWindowEnteredMonitor` rehome check
- `window.js` `_handleUserAboveChange`
- Nested prev/restore sites in `tree.js` apply, `session-api.js` — prefer `run`/`enter`/`leave` instead of prev boolean restore (nestable depth is the point)

### Tests

Update all assignments/reads of the three booleans:
- Prefer `wm._suppressGeom.enter()` / `run` / expect `.active`
- Regression `bug-w-render-storm`, `bug-jnfk`, layout-sensors, layout-epoch, WindowManager-focus, geom-open-runsteps

## Non-goals

- LayoutCommandEpoch merge into L5
- SignalBag WM array migration
- Live Shell / nest / Wayland RC
- Renaming product docs in DESIGN.md beyond optional one-line (can leave historical names)

## Acceptance

- [x] Three SuppressFlag instances on WM (geom/above/rehome)
- [x] No production sticky boolean for those three concerns
- [x] All readers use `.active` (no truthy-object footgun)
- [x] Nested suppress still works (tree.apply + move)
- [x] Throw inside suppress restores (covered by pure tests; production uses run/finally)
- [x] Related unit + regression suites green
- [x] Source bags / WindowAttach untouched except coexistence

## Context for the next agent (complete + succinct)

- **Shipped:** sticky booleans → `SuppressFlag` on WM; no dual boolean+flag ownership.
- **Fields:** `wm._suppressGeom` / `_suppressAbove` / `_suppressRehome` (labels geom/above/rehome).
- **Wire:**
  - ctor constructs three flags (`window.js`)
  - `move()` → `_suppressGeom.run(...)`
  - `_withSuppressedAboveHandler` → `_suppressAbove.run(fn)`
  - `tree.apply` → enter/leave both rehome+geom (nests under move's run)
  - session-api skeleton + placeholder bind → `_suppressRehome.enter/leave`
  - readers: `_suppressRehome.active`, `_suppressAbove.active`, `_suppressGeom?.active` in sensors
- **Footgun:** never `if (wm._suppressGeom)` — always `.active`.
- **Tests:** 1204 green (full unit/window + named regressions + extension suite).
- **Untouched:** SignalBag arrays, `_windowAttach` / `_wmSources` policy, L4 stack timer dual fields (already W2).
- **Docs residue OK:** DESIGN.md / architecture.md still name old booleans historically.
- **Next residual wire:** leftover field timers (`_previewHintFailsafeId`, `_sessionFocusRetrySrcId`); signal arrays → SignalBag; optional L8/L11.

## Session note

- 2026-08-10: After W3 residual timers. Serial suppress site wire.
- 2026-08-10 implementer: full three-flag wire. Production: window/tree/session-api/layout-sensors (+ layout-epoch comment). Tests: sensors/epoch/geom-open/focus + bug-w + bug-jnfk. `npx vitest run` suppress + sensors + epoch + bug-w + bug-jnfk + unit/window + unit/extension → **1204/1204 green**. No dual booleans. Ready for verify.
