# forge-lifecycle-abstractions_a3-signal-bag — L2 SignalBag pure + unit tests

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** A1 SourceBag; A2 L6 settle-math **done**

## Goal

Implement **L2 SignalBag**: owned GObject signal connections so disable/destroy
cannot forget a disconnect. Expand the `disconnectSignals` pattern into a bag
with groups + safe disconnect-on-finalized. Pure unit tests with a **fake
target** (no live Shell).

**Lens:** ownership + one dispose path; not “delete lines from window.js.”

## Scope (do)

| Item | Detail |
| --- | --- |
| Module | `lib/extension/signals.js` — `SignalBag` (+ thin re-export of disconnect helper if useful) |
| API | connect(target, name, cb) → id; optional **group** name; disconnect one/group/all; `dispose()`; `snapshot()` for dumps |
| Safe disconnect | try/catch per id (Bug #328 finalized GObject) — one failure must not abort remaining |
| Idempotent | dispose/cancelAll safe twice; connect after dispose no-ops or rejects consistently (document) |
| Re-home | Move `disconnectSignals` from `window.js` into signals.js; WM imports it (behavior-identical) |
| Tests | `tests/unit/extension/signals.test.js` — fake target with connect/disconnect registry |
| Wire (minimal) | Re-home only is enough for this slice; **do not** rewrite all WM signal arrays unless trivial. Optional: one small owner if low risk |

## Non-goals

- L3 Lifetime compose (next pure after L2 if time)
- L4 per-window attach (needs L2 proven)
- Migrating every `connect` in tree.js / dnd / cheatsheet in this slice
- Wayland / nest / settle product
- SourceBag changes except import hygiene if needed

## API contract (locked intent)

Mirror SourceBag spirit:

```text
bag = new SignalBag({ label: "wm" })
id  = bag.connect(target, "window-created", handler)
id  = bag.connect(target, "changed", handler, { group: "settings" })
bag.disconnect(id)           // first match if multi-target id collision
bag.disconnectGroup("settings")
bag.disconnectTarget(target) // all ids for that target
bag.disconnectAll() / dispose()
bag.snapshot()               // residual counts for failure dumps
```

**connect after dispose:** no-op, returns `null` (matches SourceBag).

**Storage:** entries list (not Map-by-id) — GObject handler ids unique **per target** only.

**Fake target for tests:** object with `connect(name, cb) → id` and `disconnect(id)` that tracks live ids; optional `finalize()` that makes disconnect throw.

## Acceptance

- [x] `lib/extension/signals.js` exports SignalBag (+ disconnectSignals helper)
- [x] Safe disconnect swallows per-id errors; clears tracked ids
- [x] Groups: connect with group; disconnectGroup leaves other groups
- [x] dispose/disconnectAll residual live ids = 0 on fake registry
- [x] `window.js` uses shared helper from signals.js (no local duplicate)
- [x] `tests/unit/extension/signals.test.js` green
- [x] Existing suites that import window/WM still green if touched (smoke: signals + bug-328 + full extension unit)
- [x] Dev logging optional: `[SignalBag:label]` connect/disconnect/dispose at DEBUG (match SourceBag style)

## Context for the next agent (complete + succinct)

- **Shipped:** `lib/extension/signals.js` — `SignalBag`, `disconnectSignals` (Bug #328 try/catch, clear array).
- **Wire:** `window.js` imports `disconnectSignals` from `./signals.js`; WM arrays still manual (`_displaySignals`, etc.) — **no** bag migration this slice.
- **API:** `connect` / `disconnect` / `disconnectTarget` / `disconnectGroup` / `disconnectAll` / `dispose` / `snapshot`; connect-after-dispose → `null`.
- **Id collision:** handler ids unique per target; bag stores entry list; `disconnect(id)` = first match — prefer target/group/dispose for multi-target bags.
- **Tests:** `tests/unit/extension/signals.test.js` (14); bug-328 regression green via re-homed helper.
- **Next after verify:** L3 Lifetime compose; later migrate WM signal arrays onto SignalBag (avoid dual ownership).
- **Do not:** import window from signals; nest/Wayland; full connect rewrite.

### Enable / test

```bash
npx vitest run tests/unit/extension/signals.test.js
npx vitest run tests/unit/extension/sources.test.js tests/unit/extension/settle-math.test.js
npx vitest run tests/regression/bug-328-disconnect-destroyed-target.test.js
npx vitest run tests/unit/extension/
```

### Risks

- Dual ownership if someone both pushes to array **and** tracks same id in bag later — keep one owner per id when migrating
- `disconnect(id)` ambiguous when two targets share the same numeric id — use `disconnectTarget` / groups

## Session note

- 2026-08-10: L2 implement — SignalBag + disconnectSignals re-home; signals unit 14/14; bug-328 OK; full `tests/unit/extension/` 603 green. Ready for verify (no commit).

- **2026-08-10 verify B:** **PASS** — L2 done for handoff. No code fixes.
- **Code review:** `lib/extension/signals.js` — groups, dispose seal, per-id try/catch, entry list (not Map-by-id), connect-after-dispose → `null`; no import of window/WM (no cycle). `window.js` imports `disconnectSignals` only; **no** local helper body. SignalBag not wired onto WM arrays yet → **no dual ownership**.
- **Tests re-run:**
  - `npx vitest run tests/unit/extension/signals.test.js` → **14 passed**
  - sources + settle-math → **32 passed**
  - `tests/regression/bug-328-disconnect-destroyed-target.test.js` → **2 passed**
  - `npx vitest run tests/unit/extension/` → **603 passed** (33 files)
- **Residue:** clean (no debug residue; comments short why-only).
- **Residual risks:** `disconnect(id)` first-match on multi-target id collision; dual ownership if later migrate while still pushing same ids to arrays.
- **Next:** L3 Lifetime compose (do not migrate all WM signal arrays in L3 unless plan says).
