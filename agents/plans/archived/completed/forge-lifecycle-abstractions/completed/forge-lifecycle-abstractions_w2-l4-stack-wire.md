# forge-lifecycle-abstractions_w2-l4-stack-wire — L4 WindowAttach stack-timeout wire

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../plans/forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** A6 pure WindowAttach; W1 `_wmSources` live

## Goal

Migrate per-window Wayland stack-pin timer `_forgeStackTimeoutId` onto
`WindowAttach` → Lifetime.sources so destroy/disable cannot forget cleanup, with
**no dual field+bag ownership**.

## Scope (do)

| Item | Detail |
| --- | --- |
| Registry | `wm._windowAttach = new WindowAttach({ label: "wm-window", schedule, cancel })` (inject like open-commit / `_wmSources`; reuse `_wmSchedule` / `_wmCancel` or dedicated inject fields) |
| Set pin | In `tree.js` `_activateWindowNode` Wayland block: `attach(mw).sources.set("stack", 50, cb)` instead of field + `GLib.timeout_add` |
| Cancel / replace | SourceBag `set` replaces prior slot — do **not** keep `_forgeStackTimeoutId` |
| unmanaged | `window.js` unmanaged handler: `wm._windowAttach.dispose(mw)` (or cancel stack + clear transient flag path) instead of field Source.remove |
| disable | After/with stack cleanup in `disable` / `_removeSignals`: `this._windowAttach.disposeAll()`; remove hand `mw._forgeStackTimeoutId` walk for timer cancel (keep `_forgeTransientAbove` unpin walk if still needed) |
| Flag | Keep `_forgeTransientAbove` boolean on MetaWindow (product pin flag, not a timer) |
| Tests | Update `tests/regression/bug-jnfk-wayland-focus-stacking.test.js` — assert bag ownership / behavior, not `_forgeStackTimeoutId` field; keep disable cancel + per-window isolation coverage |
| e2e probe | If bridge counts stack field timers, stop counting the field (attach snapshot optional) |

## Non-goals

- SignalBag WM array migration
- SuppressFlag site wire
- `_previewHintFailsafeId` / `_sessionFocusRetrySrcId` (next residual slice)
- Live Shell / nest / Wayland RC
- Migrating all windowSignals onto attach this slice

## Acceptance

- [x] `wm._windowAttach` exists (`label: "wm-window"` or similar)
- [x] Stack pin schedules **only** via attach sources slot `"stack"` (no `_forgeStackTimeoutId`)
- [x] unmanaged + disable cancel/dispose stack timers (no orphan GLib sources)
- [x] Per-window isolation still holds (fast focus burst cannot cancel other window's unpin)
- [x] `_forgeTransientAbove` + `_withSuppressedAboveHandler` behavior preserved
- [x] Regression jnfk + related window/tree unit tests green
- [x] `_wmSources` / open-commit bags untouched except coexistence

## Context for the implementer (complete + succinct)

- **Pure API:** `lib/extension/window-attach.js` — `attach(mw)` → Lifetime; `lt.sources.set("stack", 50, cb)`; `dispose(mw)` / `disposeAll()`
- **Set sites today:** `tree.js` `_activateWindowNode` Wayland block (bag slot `"stack"`); cancel: `window.js` disable → `disposeAll()`, unmanaged → `dispose(mw)`
- **Product contract:** Wayland focus make_above 50ms then unmake_above; suppress above handler; `_forgeTransientAbove` skips float-eject (forge-jnfk / forge-ph7f)
- **Dual ownership forbidden:** field path deleted when bag is live
- **Dump:** `wm._windowAttach.snapshot()`
- **Do not** start Wayland RC / nest

## Session note

- 2026-08-10: Orchestrator started residual wire queue (W2 first, then residual field timers). No AB taskforce unless DESIGN-FLAW.
- 2026-08-10 implementer: **W2 shipped.**
  - **API:** `wm._windowAttach` (`label: "wm-window"`) injects `_wmSchedule` / `_wmCancel` / `_wmScheduleIdle` same as `_wmSources`.
  - **Set:** `tree.js` `_activateWindowNode` → `attach(mw).sources.set("stack", 50, cb)`; removed GLib import from tree (was only stack pin).
  - **Cancel:** unmanaged → `dispose(mw)` + clear `_forgeTransientAbove`; disable → `disposeAll()` then existing transient-above unpin walk (no field timer walk).
  - **Deleted:** all production `_forgeStackTimeoutId` set/clear paths.
  - **Kept:** `_forgeTransientAbove`, `_withSuppressedAboveHandler` product behavior.
  - **Untouched:** `_wmSources`, open-commit, SignalBag arrays, SuppressFlag, previewHint/sessionFocusRetry fields.
  - **Files:** `lib/extension/window.js`, `lib/extension/tree.js`, `tests/regression/bug-jnfk-wayland-focus-stacking.test.js`, `tests/e2e/framework/bridge.js` (attach live source slots in fuzz timer count).
  - **Tests green:** jnfk 6, window-attach 10, `tests/unit/window/` full — **568** passed.
  - **Residual risk:** empty Lifetime bags remain on attach until unmanaged/disable after stack fire (by design; no orphan GLib ids). Next residual: field timers `_previewHintFailsafeId` / `_sessionFocusRetrySrcId`, SignalBag/SuppressFlag site wire.
