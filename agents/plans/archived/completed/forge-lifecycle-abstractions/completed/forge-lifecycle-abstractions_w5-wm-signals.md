# forge-lifecycle-abstractions_w5-wm-signals — WM global SignalBag wire

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** A3 pure SignalBag; W1–W4 residual sources/suppress done

## Goal

Migrate WM **global** signal id arrays onto one `SignalBag` with named groups so
`_removeSignals` disconnects via bag ownership (no dual array+bag tracking).

## Scope (do)

| Item | Detail |
| --- | --- |
| Bag | `this._wmSignals = new SignalBag({ label: "wm" })` on WM (constructor; lives across enable) |
| Groups | `display`, `windowManager`, `workspaceManager`, `settings`, `overview` |
| Bind | `_bindSignals`: `this._wmSignals.connect(target, name, cb, { group })` — drop array fields |
| Unbind | `_removeSignals`: `this._wmSignals.disconnectAll()` (not dispose — bag reusable on re-enable) |
| Keep array + disconnectSignals | Per-window `windowSignals` / actor `actorSignals` (L4 future); workspaceManager.destroy path |
| e2e bridge | `fuzzResourceCounts` signals count → `wm._wmSignals?.size ?? 0` |
| Tests | Any tests asserting `_displaySignals` length; window unit suite |

## Non-goals

- Per-window windowSignals/actorSignals onto WindowAttach
- Tree workspace per-ws signal map rewrite
- Lifetime full WM disable rewrite
- Live Shell / nest / Wayland RC
- L8 OpenCommit extract / L11

## Acceptance

- [x] `wm._wmSignals` exists (`label: "wm"`)
- [x] Global bind uses bag only (no `_displaySignals` / etc. production fields)
- [x] `_removeSignals` → `disconnectAll` (not dispose); re-enable can re-bind
- [x] Per-window signal arrays still cleaned as today
- [x] Unit/window suite + signals tests green
- [x] Dump: `wm._wmSignals.snapshot()`

## Context for the next agent (verify)

- **Bag:** `wm._wmSignals` (`label: "wm"`) next to `_wmSources`; constructor once; enable cycles use disconnectAll only.
- **Groups:** `display` (7), `windowManager` (3), `workspaceManager` (5), `settings` (1), `overview` (2) = 18 binds in `_bindSignals`.
- **Unbind:** `_removeSignals` → `_wmSignals.disconnectAll()` then per-window `disconnectSignals` + `tree.workspaceManager.destroy()` + `_wmSources.cancelAll()` (unchanged order intent).
- **Removed production fields:** `_displaySignals`, `_windowManagerSignals`, `_workspaceManagerSignals`, `_settingsSignals`, `_overviewSignals`.
- **Kept:** per-window `windowSignals` / `actorSignals` + `disconnectSignals` helper; workspaceManager per-ws map.
- **e2e:** `bridge.fuzzResourceCounts` → `wm._wmSignals?.size ?? 0`.
- **Tests:** signals + unit/window + unit/extension + bug-328/5y6j/2s5b/lvhp — 1195 green.
- **Dump:** `wm._wmSignals.snapshot()`.

## Session note

- 2026-08-10: After W4 suppress. Serial last residual timer/signal ownership slice.
- 2026-08-10 implementer: wire globals onto SignalBag groups; no dual array ownership; disconnectAll not dispose; bridge + bug-328 updated; suites green.
