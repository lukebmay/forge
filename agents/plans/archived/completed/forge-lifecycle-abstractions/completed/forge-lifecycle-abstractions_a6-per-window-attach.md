# forge-lifecycle-abstractions_a6-per-window-attach — L4 per-window Lifetime attach

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** L2 SignalBag; L3 Lifetime; W1 WM sources done

## Goal

**L4 Per-window attach:** WeakMap from metaWindow → Lifetime (or sources+signals)
so destroy/disable can dispose **one** owned bag per window instead of hand lists
of per-window timers/signals.

## Scope (do)

| Item | Detail |
| --- | --- |
| Module | e.g. `lib/extension/window-attach.js` — pure WeakMap attach/get/dispose/disposeAll |
| Compose | Each entry is a Lifetime (or SourceBag+SignalBag) with label including window id if available |
| dispose(metaWindow) | dispose that window's lifetime |
| disposeAll() | dispose every still-tracked entry (for disable) |
| Tests | fake windows as objects; GC not required; dispose residual 0 |
| Wire | **Minimal:** migrate **one** clear per-window resource if safe — e.g. `_forgeStackTimeoutId` onto per-window sources — **or pure-only** if wire risks dual ownership |

## Non-goals

- Migrate all windowSignals/actorSignals this slice (can leave arrays + disconnectSignals)
- Full trackWindow rewrite
- Nest/live

## Acceptance

- [x] Pure attach API + unit tests
- [x] disposeAll leaves no residual on fakes
- [x] Optional: at least one live per-window timer uses attach bag **without** dual field ownership — **deferred pure-only** (see session note)
- [x] window unit suite + attach tests green
- [x] W1 bags untouched except coexistence

## Context for the next agent (complete + succinct)

- **API:** `new WindowAttach({ label, schedule?, cancel?, scheduleIdle?, nowMs? })`
  - `attach(mw, opts?)` → Lifetime | null (create if missing; recreate if prior disposed)
  - `get(mw)` → Lifetime | null
  - `dispose(mw)` → boolean; `disposeAll()` → count
  - `snapshot()` → `{ label, size, attachCount, disposeCount, windows: [{ windowId, lifetime }] }`
  - Default lifetime label: `${registryLabel}:${windowId}` (`get_id()` / `.id` / `?`)
- **Storage:** WeakMap + Set of keys (strong while tracked so disable can disposeAll)
- **Wire:** **no** — pure-only this slice. Migrating `_forgeStackTimeoutId` needs tree set + window unmanaged/disable + regression forge-jnfk/ph7f updates in one go (dual field ownership forbidden). Next wire slice can hold `wm._windowAttach` and move stack slot to `attach(mw).sources.set("stack", 50, cb)`.
- **Do not touch:** `_wmSources`, `_openCommitSources` (coexist only).
- **Tests:** `tests/unit/extension/window-attach.test.js` (10); lifetime 8; sources 14; suppress 15.

## Session note

- 2026-08-10: After W1 verify PASS.
- 2026-08-10 implementer A: L4 pure `WindowAttach` + unit tests. Wire deferred (dual-ownership risk on stack timeout). No WM/tree edits.
- 2026-08-10 verifier B: **PASS**. Confirmed WeakMap+Set storage; attach/get/dispose/disposeAll + re-attach after dispose; pure-only (WindowAttach only in module+unit tests — no WM import); `_forgeStackTimeoutId` remains field-owned only in window.js/tree.js (no dual ownership). Tests green: window-attach 10, lifetime 8, sources 14, suppress 15. No L4 wire expansion. No code fixes.
