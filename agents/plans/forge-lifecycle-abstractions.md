# Plan: Lifecycle & pure abstractions (codebase health)

**Status:** active — **A1 SourceBag done**; next L6 settle-math + SignalBag  
**Priority:** **P0 ahead of Wayland RC continuation**  
**Updated:** 2026-08-10  
**Mode:** pure + thin wire in progress → only then more live Wayland  
**Lock:** 2026-08-10 — see [D0 task](../tasks/forge-lifecycle-abstractions_d0-rate.md)

---

## Lens (FIRM)

**Size is a symptom, not the disease.** Goal is a **healthy codebase**:

- Clear ownership of resources (timers, signals, per-window state)
- Cleanup that cannot be forgotten (one dispose path)
- Pure, reusable, **unit-testable** pieces
- Less duplication (JS thrash catalog ↔ CLI settle heuristics, GLib schedule copies)
- Fewer classes of bugs (orphan sources after disable, missed disconnect, suppress flag stuck)

Do **not** optimize for “lines deleted from `window.js`.” Prefer extracted modules that
make the right cleanup **automatic**.

Related history: [forge-codebase-audit.md](./forge-codebase-audit.md) (CA/B extracts). This plan
is **lifecycle infrastructure + pure policy**, not another size-only pass.

---

## Architecture (what is *not* a pre-req)

Larger product issues exist; **none should block L1–L6**. Bags are foundations those
areas will use. Do **not** start a multi-session redesign before pure lifecycle slices.

| Large topic | Real? | Block bags? | When / how |
| --- | --- | --- | --- |
| **WM god-object** (`window.js` size) | Yes — symptom of ownership + many domains | **No** | Bags first; extract managers when a domain has a dispose contract (pattern: Focus, DnD, session-layout-restore) |
| **Cold spine / hard-soft settle product** | Already **locked** (D008–D019) | **No** | Product work separate; do not re-litigate |
| **Failed cold → FLOAT + placeholders / self-heal** | Yes ops pain | **No** | Product spine residual — not lifecycle bags; bags still help disable correctness during that work |
| **Two settle “brains”** (ext thrash/open quiet vs CLI soft residual) | Intentional layer split + shared *formula* drift | **No** | L6 = shared **math kernel** only; keep product APIs separate |
| **Nest isolation / shared config** | Yes | **No** | Parked D0 nest — after pure health or explicit reprioritize |
| **Tree mutation / single-writer** | Partial risk under thrash | **No** | Only if a concrete DESIGN-FLAW appears; not pre-req |
| **Big-bang rewrite Tree/WM** | Would be expensive redesign | **Forbidden as first move** | general.md: stop + design blocker if multi-session rewrite tempts |

**Bottom line:** incremental lifecycle ownership is the right architectural *next* step.
Product failures (desk thrash, dual-mon cold) stay on their plans; they get safer code
when timers/signals stop leaking — they are not fixed by waiting for a mega-refactor.

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

## Locked lines (D0)

| ID | Abstraction | Verdict | Notes |
| --- | --- | --- | --- |
| **L1** | **SourceBag** | **do-now** first pure | `sources.js`; inject schedule; named slots; fold glibSchedule/Cancel here |
| **L2** | **SignalBag** | do-now pure / next wire | Expand disconnectSignals; groups; safe once |
| **L3** | **Lifetime** | do-next thin | sources + signals dispose; no DI framework |
| **L4** | **Per-window attach** | do-next | After L2; WeakMap one dispose |
| **L5** | **Suppress tokens** | do-next | Stack/finally; includes geom epoch style |
| **L6** | **settle-math kernel** | do-now pure (2nd) | rolling max×pad floor/cap; **not** merge thrash catalog with CLI session |
| **L7** | Catalog façade | thin only | Catalog stays; may call L6 |
| **L8** | OpenCommit manager | do-next | First **wire** owner of SourceBag; extract manager optional after |
| **L9** | utils split | **defer** | Keep one file; tests already good |
| **L10** | EventQueue + drain source | accept after L1 | queueEvent owns drain via bag |
| **L11** | Batch-depth pure | accept small | openLayoutBatchDepth state machine |
| **L12** | Place-hint bag | reject now | already pure + tested |
| **L13** | Render policy table | reject / later | product not lifecycle |

**Implement order (locked):**  
Pure: L1 → L6 → L2 → L3 → L5 → L11 optional.  
Wire: open-commit → WM/LC global sources → L4 → L8 extract optional → suppress sites.

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
| **D0** | Rate + invent + utils + test plan + lock | **Done** 2026-08-10 |
| **A1** | SourceBag pure + unit tests + open-commit wire | **Done** [task](../tasks/forge-lifecycle-abstractions_a1-source-bag.md) |
| **A2+** | settle-math kernel; SignalBag; Lifetime; suppress; … | next |
| **W1+** | More WM named sources; per-window attach; suppress sites | open-commit already on SourceBag |
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
| D0 rate + invent + utils + test plan | [forge-lifecycle-abstractions_d0-rate.md](../tasks/forge-lifecycle-abstractions_d0-rate.md) | **done / locked** |
| A1 SourceBag pure + tests + open-commit wire | [forge-lifecycle-abstractions_a1-source-bag.md](../tasks/forge-lifecycle-abstractions_a1-source-bag.md) | **done** |
| Later slices | TBD (A2 settle-math, SignalBag, more WM sources, …) | — |

---

## Links

- [HANDOFF.md](../HANDOFF.md) — start here; this plan is P0  
- [PRIORITY.md](../PRIORITY.md)  
- [app-thrash-catalog.js](../../lib/extension/app-thrash-catalog.js)  
- [layout-open.js](../../lib/extension/layout-open.js)  
- [settle_heuristics.py](../../scripts/forge/settle_heuristics.py)  
- [utils.js](../../lib/extension/utils.js)  
- Nested isolation (parked under this for priority, not cancelled): [D0 nest](../tasks/forge-nested-isolation_d0-discussion.md)
