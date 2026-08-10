# forge-lifecycle-abstractions_a5-suppress — L5 suppress tokens pure

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** L3 Lifetime done (order); pure stack can land anytime after L1

## Goal

Implement **L5 suppress tokens**: nested enter/leave (or `run(fn)`) so suppress
flags cannot stick on throw. Pure unit-testable; **not** a rewrite of every
`_suppress*` site in this slice.

**Problem class:** sticky booleans (`_suppressGeometrySignalRetile`,
`_suppressEnteredMonitorRehome`, `_suppressAboveHandler`) when finally omitted
or early return skips restore.

## Scope (do)

| Item | Detail |
| --- | --- |
| Module | `lib/extension/suppress.js` |
| API | Nestable counter or token stack; `run(fn)` with try/finally; `active` / `depth`; optional named slots map |
| Pure | No GObject |
| Tests | nested run, throw restores, re-entrant, independent named keys |
| Wire | **Optional one site** only if trivial risk-free (e.g. `_withSuppressedAboveHandler` body). Prefer pure-only if unsure |

## Non-goals

- Replace LayoutCommandEpoch (related but separate AC2 product)
- Migrate all suppress sites
- L4 per-window attach
- L11 batch-depth (optional later)

## API contract (intent)

```text
// Primary design: SuppressFlag (one nestable counter per concern)
s = new SuppressFlag({ label: "above" })
s.run(() => { assert s.active && s.depth === 1 })
// after throw: s.active === false, depth restored
s.enter() / s.leave()   // manual nest; leave clamps at 0
s.snapshot()            // { label, depth, active }
// Independent concerns = independent instances (not a named bag)
```

**Design pick:** `SuppressFlag` only (not SuppressBag). Owners hold one flag
per sticky-boolean concern. Named multi-key bag deferred until wire demand.

## Acceptance

- [x] Pure module exported
- [x] Nested enter/leave or nested `run` works
- [x] Throw inside `run` restores prior depth/active
- [x] Unit tests green
- [x] No sticky flag after throw in tests
- [x] Bag suites (sources/signals/lifetime) still green if anything imported

## Context for the next agent (complete + succinct)

- **Shipped:** `lib/extension/suppress.js` — `SuppressFlag` pure nestable depth + `run(fn)`.
- **API:** ctor `{ label? }`; `.depth` / `.active`; `enter()` / `leave()` (leave clamps ≥0); `run(fn)` try/finally returns fn value; `snapshot()`.
- **Design:** single-flag class only (not SuppressBag). Independent keys = separate instances (`geom` vs `above`).
- **Wire:** **none** this slice. `_withSuppressedAboveHandler` still boolean + local prev/finally; wiring would need all `this._suppressAboveHandler` reads → `.active` (or dual-write) — not risk-free.
- **Tests:** `tests/unit/extension/suppress.test.js` (15) — nest, throw restore, reenter, independent instances, snapshot.
- **Sibling smoke:** lifetime 8 + sources 13 + signals 14 + settle-math 19 green.
- **Next:** more WM SourceBag wire / signal-array migration; opportunistic suppress site wire; L4 attach later.
- **Do not:** nest/Wayland; migrate all `_suppress*` as one campaign; merge layout-epoch into L5.

## Session note

- 2026-08-10: Opened after L3 verify PASS.
- 2026-08-10 implementer A: SuppressFlag pure + unit tests. Design = single nestable flag (not bag). run/enter/leave/snapshot; throw restores; leave clamps. Wire skipped (boolean field coupling). 15 suppress + 35 sibling bag tests green. Ready for verify.

- **2026-08-10 verify B:** **PASS** — L5 suppress pure done for handoff. No code fixes.
- **Code review:** `lib/extension/suppress.js` — depth counter; `run` enter/try/finally leave; leave clamps at 0; throw restores prior depth (outer hold preserved); independent instances; pure JS only (no GObject).
- **Wire decision confirmed correct:** no `SuppressFlag` import outside tests; `window.js` `_withSuppressedAboveHandler` still boolean+prev/finally; geom/rehome suppress still booleans with local prev. Half-wire would desync reads of `_suppressAboveHandler` / `_suppressGeometrySignalRetile` — pure-only is right for this slice.
- **Tests run:** suppress 15/15; lifetime 8 + sources 13 + signals 14 + settle-math 19 = 54 sibling green.
- **Residue:** clean (no half-migrated WM fields; no TODO/FIXME in module).
- **Next:** WM bag wire / more named sources / signal arrays; suppress site wire opportunistic; L4 attach later. Do not start L4/L11/wire campaign in this verify.
