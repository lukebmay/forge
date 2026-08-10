# Plan: Lifecycle & pure abstractions (codebase health)

**Status:** active — **D0 rate + invent first** (no big extract until locked)  
**Priority:** **P0 ahead of Wayland RC continuation**  
**Updated:** 2026-08-10  
**Mode:** discussion → lock → implement pure + unit tests → thin wire → only then more live Wayland  

---

## Lens (FIRM)

**Size is a symptom, not the disease.** Goal is a **healthy codebase**:

- Clear ownership of resources (timers, signals, per-window state)
- Cleanup that cannot be forgotten (one dispose path)
- Pure, reusable, **unit-testable** pieces
- Less duplication (JS thrash catalog ↔ CLI settle heuristics, GLib schedule copies)
- Fewer classes of bugs (orphan sources after disable, missed disconnect, suppress flag stuck)

Do **not** optimize for “lines deleted from `window.js`.” Prefer extractions modules that
make the right cleanup **automatic**.

Related history: [forge-codebase-audit.md](./forge-codebase-audit.md) (CA/B extracts). This plan
is **lifecycle infrastructure + pure policy**, not another size-only pass.

---

## Why now

- `window.js` still owns ad-hoc GLib sources, connect arrays, and long `disable()` checklists.
- Partial helpers exist (`disconnectSignals`, `_clearTimeoutId`, `glibSchedule` in
  `layout-controller.js`, `AppThrashCatalog`, `layout-open.js`) but no **owned bag** pattern.
- Recent desk thrash / FLOAT / hard-ready failures and nest isolation pain are easier to
  reason about when lifecycle and heuristics are pure and tested.
- Operator: **pause new Wayland testing campaign** until these abstractions are rated,
  locked, and the first high-value pure slices land with tests.

---

## Candidate lines (rate in D0 — provisional ranks)

Agents **must re-examine and rate** these (impact on bugs, reuse, testability, cost, risk).
Do not treat the order below as locked.

| ID | Abstraction | Intent | Pure? | Notes / existing code |
| --- | --- | --- | --- | --- |
| **L1** | **`sources.js` / SourceBag** | All GLib timeout/idle owned; named slots; `cancelAll` | Yes (inject schedule) | Fold `glibSchedule`/`glibCancel` out of layout-controller |
| **L2** | **`signals.js` / SignalBag** | All `.connect` via bag; safe disconnect once; groups | Adapter over GObject | Expand local `disconnectSignals`; per-target groups |
| **L3** | **`Lifetime` / Disposable** | `sources + signals` dispose together | Yes | WM + managers + per-window attach |
| **L4** | **Per-window attach** | One dispose for windowSignals, actorSignals, stack timeout, borders bookkeeping | Mostly glue | WeakMap; track/destroy/disable one path |
| **L5** | **Suppress tokens** | Stack/finally for geometry / entered-monitor / session flags | Yes | Prevent stuck `_suppress*` |
| **L6** | **Heuristics / HQueue** | Rolling N samples + soft timeout ops | Yes | Unify with `SETTLE_ROLLING_N`, CLI `settle_heuristics.py` |
| **L7** | **Catalog façade** | Thin pure under `AppThrashCatalog`; seed load helper | Yes | Do **not** duplicate catalog class |
| **L8** | **OpenCommit controller** | Quiet schedule/cancel/touch/fire as manager | Pure policy + sources | Uses L1 + L6/L7 |
| **L9** | **`utils.js` audit/split** | Domain clusters (rect/geom, grab/DnD, mon/ws ids, gnome compat) | Yes | ~615 lines; see D0 |
| **L?** | **Other (invent)** | D0 must propose additional high-value pure abstractions | — | Prefer testable pure over glue churn |

**Provisional implement order after lock (example only):**  
L1 → L2 → L3 → L6/L7 (pure first) → L4 → L8 → L5 → L9 as needed.

---

## Non-goals

- Big-bang rewrite of `WindowManager` / `Tree`
- Pausing cold-spine **product** contracts (D019, Mode B rules stay)
- Drive-by Wayland RC matrix expansion while D0/impl unfinished
- Prefs GTK unit-testing
- “Make `window.js` under N lines” as a success metric

---

## Work sequence

| Phase | Work | Gate |
| --- | --- | --- |
| **D0** | Rate candidates; invent more; utils inventory; test strategy; recommend order | User lock |
| **A1+** | Implement pure modules + **comprehensive unit tests** first | `npm test` / vitest green |
| **W1+** | Wire one owner at a time (open-commit, then WM bind/disable, …) | No behavior change intended; smoke light |
| **After** | Resume nest dual-mon RC + isolation D0 as product priorities | Handoff flip |

---

## Testing (FIRM for this plan)

| Kind | Expectation |
| --- | --- |
| **Unit** | Primary. SourceBag, SignalBag (fake target), HQueue/soft-timeout golden cases, suppress tokens, pure utils splits |
| **Parity** | Heuristics: shared golden cases JS ↔ CLI (`settle_heuristics`) where math must match |
| **Live** | Minimal after wire (optional host smoke); **not** full Wayland RC until plan says resume |
| **Leak** | Fake GLib: after `cancelAll`/`dispose`, no residual source ids |

Inject schedule/cancel (pattern already used by LayoutController / open-commit).

---

## Success metrics (health)

- New GLib sources / connects in extension code go through bags (convention or CI grep)
- `disable()` / window destroy use **dispose**, not growing hand lists
- Heuristics math has one pure home + unit coverage; thrash catalog uses it
- `utils.js` either justified as one module or split by domain with tests moving with code
- Agents can add a timer or window signal **without** a new disable checklist line

---

## Tasks

| Task | Path | Status |
| --- | --- | --- |
| D0 rate + invent + utils + test plan | [forge-lifecycle-abstractions_d0-rate.md](../tasks/forge-lifecycle-abstractions_d0-rate.md) | **ready / P0** |
| Implement slices | TBD after lock | — |

---

## Links

- [HANDOFF.md](../HANDOFF.md) — start here; this plan is P0  
- [PRIORITY.md](../PRIORITY.md)  
- [app-thrash-catalog.js](../../lib/extension/app-thrash-catalog.js)  
- [layout-open.js](../../lib/extension/layout-open.js)  
- [settle_heuristics.py](../../scripts/forge/settle_heuristics.py)  
- [utils.js](../../lib/extension/utils.js)  
- Nested isolation (parked under this for priority, not cancelled): [D0 nest](../tasks/forge-nested-isolation_d0-discussion.md)
