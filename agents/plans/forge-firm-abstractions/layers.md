# Target layers (working draft)

**Status:** locked D079 + D080 + D082 + D083 + D084 + **D085**
**As of:** 2026-08-28
**Sources:** explore/01–06, D073/D074/D079/D080/D082/D083/D084/D085.
**RuleSet:** [ruleset.md](./ruleset.md) · **Keybinds:** [keybinds.md](./keybinds.md)

## Layer table

| Layer | Owns | Must not own | From |
| --- | --- | --- | --- |
| **TOM** | Plain forest: kinds, `parentId`/`childIds`, layout, percent/`userSized`, lastTabFocusId, spine ROOT→WS→MONITOR | GObject, Meta, St, DOM, keybinds, OpSet policy, paint, settle laws, session prefs, workarea | 01, 02 |
| **Session** | WeakMap bag: `decisions`, `mergeTags` (`lib/session/`) | Topology; RuleSet; Meta | D082 |
| **World** | WeakMap bag: MONITOR workarea (`lib/world/`); neighbor / edge / sibling-axis queries | Topology mutation; RuleSet; paint; session | D083, D084 |
| **Atomics + composed** | Child-list atomics; breakout, wrap, promoteChildren (**no settle**) | Super+h; `move_resize`; “after promote, collapse” | 01, D080 |
| **RuleSet** | Named settle: order of prune / unary / coerce / MONITOR max-1. Bound by an OpSet | Launch/Move policy; keybinds; Meta | D080 |
| **OpSet** | Mark 2 first (`lib/opsets/`). Glossary = `mark2.md`. Calls atomics + RuleSet | Child-list splicing; presenter; a private settle | 01, D080, D084 |
| **Keybind core** | Action id → Super-bearing chord (Mark 2 table) | Platform accel grammar; proto `a`/`q`; Gnome lock/zoom/run | D080, D085 |
| **Keybind adapter** | Map that table to a host: **KeybindAdapterGnome**, **KeybindAdapterWebView** | A second action-id table | D085 |
| **Presenter math** | Slots from TOM + workarea → AABB (`lib/presenter/` paneRect) | Topology mutation; Mutter/DOM paint | 04, D083 |
| **Host adapter** | **ForgeAdapterGnome** / **ForgeAdapterWebView**: native window ↔ WINDOW, signals, fill world, paint | Tiling policy; `createNode` | 03, D085 |
| **Epochs** | Apply, session restore, H1 — three forest writers | Idle keybind; merging the two monitor-resolves | 05 |
| **Surfaces** | DnD gesture, CLI, DBus, prefs, host key overlays | A second tree mutator; a second Mark 2 chord table | 06 |
| **Product data** | Profiles, settings, windows.json, mins, heuristics | Role-name branches | 03, 05 |

Physical lift (P1–P4): proto `src/tom/` → `lib/tom/`; settle →
`lib/rulesets/`; Mark 2 kit → `lib/keybinds/`; session bag →
`lib/session/`; world bag → `lib/world/`; paneRect → `lib/presenter/`;
Mark 2 OpSet → `lib/opsets/`.
gi-free ESM. Proto tests and proto key table point at those. Forge
`Node`/`Tree` are **not** that kernel.

**D085:** kernel (above, through keybind **core**) is host- and
language-portable. Host + keybind **adapters** bind an environment.
JS `lib/` is the reference impl, not a GNOME module.

## TOM (01+02 — meeting-ready)

Proto `Forest` + POJO `Node` **is** the product tree. Forge `Node`
extends GObject, stores Meta/St in `_data`, constructs decorations in
the ctor, and `Tree` *is* ROOT. That object cannot be shared TOM.

| In TOM | Not in TOM |
| --- | --- |
| kinds ROOT/WS/MONITOR/CON/WINDOW | `GObject.registerClass` |
| `percent` + `userSized` (float share ≠ Forge `mode: FLOAT`) | `mode` FLOAT/GRAB_TILE (Host/product) |
| `lastTabFocusId` (id string) | `lastTabFocus` as Meta.Window |
| child list via atomics only | `childNodes` setter; actor teardown on detach |
| placeholder flag as **data** | St.Bin CON value |
| | `Forest.decisions` / `mergeTags` / `peelModel` — **P2:** `lib/session/` |
| | MONITOR `geom` — **P3:** `lib/world/` |
| | `zoomMode` (Presenter) |
| | `PRESET` layout (drop) |

**Spine:** ROOT → WORKSPACE* → MONITOR → CON|WINDOW. MONITOR max-1 is a
**mark2 RuleSet** post-settle invariant, not an atomic. Adopt wraps
n-child MONITOR once.

`tree-query.js` is already a Surface projection (keep). `tree-snapshot.js`
is an Epoch forest document still keyed by live Meta.Window (reshape).

## Atomics + composed (core spine)

| Op | Home | Notes |
| --- | --- | --- |
| append/insert/remove/replace | `tom/atomics` | Same names as D023. No actor teardown |
| breakout | `tom/composed` | One node becomes sibling of parent. **Does not settle** |
| wrapNodes / promoteChildren | composed | wrap = insert CON; ungroup = promoteChildren |
| sizing / float shares / 10% floor | `tom/sizing` | Leave-split clears `userSized` |

Unary collapse, prune empty, same-type coerce, MONITOR max-1 repair are
**RuleSet**, not atomics. See [ruleset.md](./ruleset.md).

Forge `cleanTree` is **not** the RuleSet. Replace it.

Product **Move is Mark 2 Move** (D080). Forge `tree.move` is discarded
as a twin, not parked as a second OpSet.

## RuleSet (D080)

Named module `lib/rulesets/{core,mark2}.js`. OpSet **binds** one.
Mark 2 binds `mark2` = core (prune → unary → share repair) + coerce
TABBED + MONITOR max-1. Detail: [ruleset.md](./ruleset.md).

## OpSet (01 + D080)

Mark 2: `mark2.md` (FIRM glossary) + `lib/opsets/`. Ops: Move, Join,
Launch, Toggle*, Promote*, Remove. After each mutating op: bound
RuleSet `settle()`. Cross-mon neighbor math is
`lib/world/neighbors.js` (tie-break string); `transferLeafToMonitor`
is OpSet place + RuleSet max-1.

CommandHandler / proto keys dispatch **shared action ids**
([keybinds.md](./keybinds.md)).

## Keybind core + adapters (D080, D085)

One Super-bearing Mark 2 **action-id** table (kernel). Adapters:

- **KeybindAdapterGnome** — table as GNOME accels; Safe/i3 = overlays
- **KeybindAdapterWebView** — `stripSuper` + proto overlay (`a`/`q`)

Detail: [keybinds.md](./keybinds.md).

## Presenter (04 — meeting-ready)

Same TOM, two **host adapters** paint. WebView = CSS flex + open-tab-only
DOM. Gnome = every mapped TILE (D069 buried peers stay mapped —
**adapter** policy, not a TOM invariant).

| Piece | Keep as |
| --- | --- |
| percent → AABB / tab wrap | gi-free Presenter math beside TOM (`paneRect` sibling). Stop `computeSizes` write-back of `child.percent` |
| workarea fetch | Host |
| `apply` → `wm.move` → `move_resize_frame` | Host paint chokepoint |
| `Node.rect` setter painting St | **leak** — split |
| `_createDecoration` in Node ctor | **leak** |
| `#forge-tab-chrome` / D046 | Presenter + Host (St) |
| D069 visible-first + shared slot | Presenter |
| D030 zoom | Presenter flag |
| Apply overlay | Epoch chrome |
| Raise paths | Host, **do not unify** |

## Host adapter (03 — meeting-ready, D085)

**ForgeAdapterGnome** = today's GJS Host (façade may stay named
`WindowManager` for spies). **ForgeAdapterWebView** = proto HTML desk.
Reshape Gnome into a thin Mutter adapter. Do not pare `window.js` in
place.

**Host keeps:** signal bind, Meta↔WINDOW id, `move_resize_frame`,
workarea/mon/ws lists, SourceBag/SignalBag/SuppressFlag, census,
`_validWindow`, paced `queueEvent`.

**Host drops (today inlined):** `trackWindow` placement policy,
`processFloats`, I3 owning-split, D026/overflow decisions, CommandHandler
bodies, DnD execute, ApplyEpoch logic (epoch owns it; WM only flags).

`disable()` is still a checklist — wire **Lifetime at Host scope**.
WindowAttach is only the `"stack"` slot; per-window Meta signals still
live on the Meta object.

WorkspaceManager / MonitorManager: keep as Host list+signals+geometry;
drop St.Bin + `createNode`.

A façade still named `WindowManager` **may** remain for GJS spies
(D085); the **role** is ForgeAdapterGnome. It must not own policy.

**Strategies to import onto Host+OpSet+Presenter+Epochs** (not rewrite):
open-app home sequence; OpenCommit vs ApplyLayout as two brains;
D026+overflow; D044 group home; H1 dual resolve + session shield;
ApplyEpoch sole writer; AC4 placeholders; I3 owning-split; action-pipeline
stages; multi-path raise; open leaf ≠ keyboard focus.

## Epochs (05 — meeting-ready)

Three writers of a forest, on purpose. Not the TOM.

| Writer | Forest | Monitor resolve |
| --- | --- | --- |
| **ApplyEpoch** | Desired profile | N/A (desired mon is data) |
| **Session disk** | Last-good after HUP | `resolveStrictMonitor` (exact; no majority) |
| **H1 / T6** | Live thrash | `resolveTargetMonitor` (stableKey / majority) |

Do **not** merge the two resolve functions. Shield: while session shield
is live, H1 **reapplies** the restored forest and does not snapshot Meta
pile. Displays-changed during apply: **cancel apply, skip H1**.

Product apply spine (import as strategy, not the `APPLY_LAYOUT_PHASES`
walk): epoch → materialize → slot machines (slot = WINDOW \| TAB/STACK
CON) → forest-match `Done.ok` → focus/soft. Belt / Mode-B-as-cold /
TILE-anywhere success = **discard**.

T6 capture is the closest in-memory TOM snapshot — strip Meta/St from
the pure module. Session portable should become **TOM serialization +
identity adapter** (today a third JSON shape). Apply today plans against
GetTree `projectForest` (a Surface projection) — later: desired TOM;
do not block kernel lift on a planner rewrite.

`LayoutCommandEpoch` is command **echo**, not a forest writer. D070
failsafe is a prod guardrail, never kernel.

## Surfaces (06 — meeting-ready)

Surfaces translate intent → OpSet / epoch. They do not splice the tree.

| Surface | Becomes |
| --- | --- |
| Keybinds + CommandHandler | Shared Mark 2 table ([keybinds.md](./keybinds.md)) → OpSet ids + `commitLayout`. Host overlays only |
| DnD gesture / zones / intent | Keep. `_executeDropOperation` **discard** as mutator — zone → Mark 2 Join/Move/wrap |
| Tab-strip reorder | Keep: `replaceChildren` + one commit |
| RunSteps | One dispatcher; ops rename toward OpSet |
| DBus product | Ping, GetTree, Focus, Swap, Move, PlaceNext, settings, RunSteps, ApplyLayout family, Log |
| DBus accident | LayoutBatch, RunSteps `dnd-drop`/`skeleton`/`bind` as user API |
| LFT / open-min / PlaceNext | Product policy + Launch/Join, not TOM |
| `lib/shared/` | gi-free **product** kernel (settings/plan), **not** the TOM |
| Prefs GTK | Keep as prefs surface |

**Three Moves today** (keybind directional, DBus reparent, DnD zone) must
become Mark 2 Move/Join plus atomics. `lib/shared` staying ≠ TOM is the
split D036 did not name.

## Open (do not block P5)

1. **WINDOW identity in TOM:** Meta.Window vs stable windowId vs both
   during adapter period?
2. Proto vs Forge TAB paint (open-only vs mapped peers) — **adapter**
   product lock, not TOM.

**Locked (were open):** MONITOR max-1 = mark2 RuleSet after settle.
Product Move = Mark 2 Move. Host **role** = ForgeAdapterGnome
(`WindowManager` façade may stay for spies — D085).
