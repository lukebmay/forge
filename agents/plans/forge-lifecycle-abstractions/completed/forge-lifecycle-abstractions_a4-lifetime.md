# forge-lifecycle-abstractions_a4-lifetime — L3 Lifetime thin compose

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** A1 SourceBag; A3 SignalBag (done)

## Goal

Implement **L3 Lifetime**: thin compose of SourceBag + SignalBag with **one
dispose path**. Not a DI framework. Owners can hold a Lifetime and dispose once
to drop all timers + signals owned under it.

## Scope (do)

| Item | Detail |
| --- | --- |
| Module | `lib/extension/lifetime.js` |
| Compose | Owns or wraps a SourceBag + SignalBag (create if not injected) |
| Accessors | `.sources`, `.signals` (or methods that return bags) |
| dispose() | dispose signals then sources (or document order); idempotent |
| snapshot() | combined residual for dumps |
| label | Propagate label to child bags |
| Tests | `tests/unit/extension/lifetime.test.js` with fake schedule + fake signal targets |
| Wire | Optional: none required this slice. Do not migrate WM disable yet unless trivial |

## Non-goals

- Full WM disable rewrite
- L4 per-window WeakMap attach (next wire phase)
- L5 suppress (separate task after L3)
- Frameworky container/service locator

## API contract (intent)

```text
lt = new Lifetime({ label: "wm", schedule?, cancel?, scheduleIdle? })
lt.sources.set("queue", 16, cb)
lt.signals.connect(target, "name", cb, { group: "display" })
lt.dispose()   // both bags clean; sealed
lt.snapshot()  // { sources, signals, disposed }
```

Order on dispose: prefer **signals first** (callbacks may still schedule) then **sources**, or document why reverse. Idempotent dispose.

## Acceptance

- [x] `lib/extension/lifetime.js` exports Lifetime
- [x] dispose cleans both bags; residual 0 on fakes
- [x] double dispose safe
- [x] unit tests green
- [x] sources/signals/settle-math suites still green (smoke)

## Context for the next agent (complete + succinct)

- **Shipped:** `lib/extension/lifetime.js` — `Lifetime` thin compose of SourceBag + SignalBag.
- **API:** ctor `{ label, schedule?, cancel?, scheduleIdle?, nowMs?, sources?, signals? }`; `.sources` / `.signals`; `dispose()` (signals then sources, idempotent); `snapshot()` → `{ label, disposed, sources, signals }`.
- **Dispose order:** signals first (handlers may arm timers) then sources (cancel residuals). Child bags seal; set/connect after dispose → `null`.
- **Wire:** none this slice (no WM disable migration).
- **Tests:** `tests/unit/extension/lifetime.test.js` (8) + sources (13) / signals (14) / settle-math (19) smoke green.
- **Next:** verify pass; then L5 suppress or wire more WM sources / migrate signal arrays; L4 attach later.
- **Do not:** nest/Wayland; full disable rewrite this slice.

## Session note

- 2026-08-10: Opened after L2 verify PASS.
- 2026-08-10 implementer A: Lifetime pure + unit tests. dispose signals→sources; inject bags optional; label prop to children. 8 lifetime tests + sibling smoke green. No WM wire.

- **2026-08-10 verify B:** **PASS** — L3 Lifetime done for handoff. No code fixes.
- **Code review:** `lib/extension/lifetime.js` — thin compose; dispose order **signals then sources**; label propagated on create (not re-stamped on inject); optional `sources`/`signals` inject; `snapshot()` merges child dumps; double dispose + sealed set/connect covered.
- **Tests run:** lifetime 8/8; sources 13 + signals 14 + settle-math 19 = 46 sibling green.
- **Residue:** clean (no TODO/FIXME/console; no WM wire this slice).
- **Next:** L5 suppress (plan pure order) or more WM SourceBag wire / migrate signal arrays; L4 attach later. Do not start L5 in this verify.
