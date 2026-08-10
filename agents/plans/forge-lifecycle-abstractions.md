# Plan: Lifecycle & pure abstractions (codebase health)

**Status:** active — **pure + W1–W5 + L8/L11 done**; optional per-window signal arrays remain  
**Priority:** product next = resume Wayland nest RC (or per-window signals later)  
**Updated:** 2026-08-10  
**Mode:** lifecycle health slices complete for plan scope → live Wayland when resumed  
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
| **L1** | **SourceBag** | **done** | `sources.js`; open-commit + W1 `_wmSources` wired |
| **L2** | **SignalBag** | **done** pure + **W5 wire** | `signals.js`; `wm._wmSignals` owns globals |
| **L3** | **Lifetime** | **done** thin | `lifetime.js`; signals→sources dispose |
| **L4** | **Per-window attach** | **done pure + W2 wire** | `window-attach.js`; stack slot `"stack"` live |
| **L5** | **Suppress tokens** | **done pure + W4 wire** | `suppress.js`; geom/above/rehome on WM |
| **L6** | **settle-math kernel** | **done** | `settle-math.js` + CLI golden parity |
| **L7** | Catalog façade | thin only | Catalog stays; may call L6 |
| **L8** | OpenCommit manager | **done** | `open-commit-manager.js`; bag + pending; fire stays on WM |
| **L9** | utils split | **defer** | Keep one file; tests already good |
| **L10** | EventQueue + drain source | accept after L1 | queueEvent owns drain via bag |
| **L11** | Batch-depth pure | **done** | `layout-batch-depth.js`; WM `_layoutBatch` |
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
| **A1** | SourceBag pure + unit tests + open-commit wire | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a1-source-bag.md) |
| **A2** | settle-math kernel + golden parity | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a2-settle-math.md) |
| **A3** | SignalBag pure + disconnectSignals re-home | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a3-signal-bag.md) |
| **A4** | Lifetime pure compose | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a4-lifetime.md) |
| **A5** | SuppressFlag pure | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a5-suppress.md) |
| **A6** | WindowAttach pure | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a6-per-window-attach.md) |
| **W1** | WM global timers → `_wmSources` (10 slots) | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w1-wm-sources.md) |
| **W2** | L4 stack → WindowAttach | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w2-l4-stack-wire.md) |
| **W3** | Residual WM field timers → `_wmSources` | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w3-residual-wm-timers.md) |
| **W4** | SuppressFlag sites | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w4-suppress-sites.md) |
| **W5** | WM global SignalBag | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w5-wm-signals.md) |
| **L8** | OpenCommitManager extract | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_l8-open-commit-manager.md) |
| **L11** | LayoutBatchDepth pure | **Done** [completed](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_l11-batch-depth.md) |
| **Optional later** | Per-window `windowSignals`/`actorSignals` → WindowAttach | not blocking RC |
| **Product next** | Resume nest dual-mon RC + isolation D0 | Handoff |

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
| A1 SourceBag pure + tests + open-commit wire | [forge-lifecycle-abstractions_a1-source-bag.md](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a1-source-bag.md) | **done** |
| A2 settle-math kernel + golden parity | [forge-lifecycle-abstractions_a2-settle-math.md](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a2-settle-math.md) | **done** |
| A3 SignalBag pure + re-home disconnectSignals | [forge-lifecycle-abstractions_a3-signal-bag.md](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a3-signal-bag.md) | **done** |
| A4 Lifetime pure compose | [forge-lifecycle-abstractions_a4-lifetime.md](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a4-lifetime.md) | **done** |
| A5 SuppressFlag pure | [completed A5](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a5-suppress.md) | **done** |
| A6 WindowAttach pure | [completed A6](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_a6-per-window-attach.md) | **done** |
| W1 WM SourceBag wire (10 slots) | [completed W1](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w1-wm-sources.md) | **done** |
| W2 L4 stack wire | [completed W2](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w2-l4-stack-wire.md) | **done** |
| W3 residual WM timers | [completed W3](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w3-residual-wm-timers.md) | **done** |
| W4 suppress sites | [completed W4](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w4-suppress-sites.md) | **done** |
| W5 WM SignalBag wire | [completed W5](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_w5-wm-signals.md) | **done** |
| L8 OpenCommitManager | [completed L8](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_l8-open-commit-manager.md) | **done** |
| L11 LayoutBatchDepth | [completed L11](./forge-lifecycle-abstractions/completed/forge-lifecycle-abstractions_l11-batch-depth.md) | **done** |
| Later optional | Per-window signals → attach | **optional** |

---

## Links

- [HANDOFF.md](../HANDOFF.md) — start here; this plan is P0  
- [PRIORITY.md](../PRIORITY.md)  
- [app-thrash-catalog.js](../../lib/extension/app-thrash-catalog.js)  
- [layout-open.js](../../lib/extension/layout-open.js)  
- [settle_heuristics.py](../../scripts/forge/settle_heuristics.py)  
- [utils.js](../../lib/extension/utils.js)  
- Nested isolation (parked under this for priority, not cancelled): [D0 nest](../tasks/forge-nested-isolation_d0-discussion.md)
