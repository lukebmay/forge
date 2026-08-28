# Forge proper tree / Node — wrong center of gravity

**As of:** 2026-08-27
**Domain:** forge tree (`lib/extension/tree.js` + layout/snapshot/query)
**Audience:** P0b import-map / later kernel lift. Open this instead of
rescanning ~4k lines.

Forge calls this the tiling **tree**. Mark 2 / design TOM is the same
spine words (ROOT → WS → MONITOR → CON | WINDOW) but **not** this
object graph. This file is GObject + Meta + St + OpSet + presenter in
one class. That is why it cannot be the shared TOM as-is.

---

### Scope

Opened:

- `lib/extension/tree.js` (3962 lines) — `NODE_TYPES` / `LAYOUT_TYPES`,
  `Node`, `Queue`, `Tree`
- `lib/extension/tree-layout.js`, `tree-snapshot.js`, `tree-query.js`
- `lib/extension/enum.js` (`createEnum` only)
- `lib/extension/monitor.js` `addMonitor` (MONITOR scaffold)
- `docs/dev/architecture.md` § tiling tree
- `docs/dev/contracts.md` child-list / group / ungroup / setLayout /
  split / move rows
- `prototypes/container-motion/src/opsets/mark2.md` (words)
- Proto kernel: `tom/kernel.mjs` `createForest` / `makeNode`;
  `tom/composed.mjs` `collapseUnary` / `cleanupStructure`;
  `tom/sizing.mjs` float = not `userSized`
- Tests: `tests/unit/tree/*`, `tests/unit/extension/tree-snapshot.test.js`,
  `tree-query.test.js`; greps for `childNodes =` / `parentNode =`

Did **not** open: `window.js` body (except `WINDOW_MODES` export),
DnD/session apply (other notes), proto OpSet implementation.

---

### Current objects (as the code is)

| Name | File:symbol | What it actually does today |
| --- | --- | --- |
| `NODE_TYPES` | `tree.js:52` | Frozen strings: ROOT, MONITOR, CON, WINDOW, WORKSPACE. **Not** in `enum.js`. |
| `LAYOUT_TYPES` | `tree.js:60` | STACKED, TABBED, ROOT, HSPLIT, VSPLIT, **PRESET** (PRESET unused in `lib/`). |
| `ORIENTATION_TYPES` / `POSITION` | `tree.js:62–64` | HORIZONTAL/VERTICAL; BEFORE/AFTER/UNKNOWN. Used by split/move. |
| `WINDOW_MODES` | `window.js:183` | FLOAT, TILE, GRAB_TILE, DEFAULT. Tree **imports** `window.js` for this. |
| `createEnum` | `enum.js:4` | `{ VAL: "VAL" }` freeze helper. |
| `Node` | `tree.js:115` | GObject. One spine/window/CON. Owns **Meta or St**, chrome, percents, mode. |
| `Queue` | `tree.js:1133` | GObject array queue for BFS `_traverseBreadthFirst`. |
| `Tree` | `tree.js:1156` | **Is the ROOT node** (`super(NODE_TYPES.ROOT, rootBin)`). Also WM hub: workspaces, snapshot, move/group, render/apply. |
| `MonitorManager` | `monitor.js:30` | Creates one MONITOR node per output per workspace + `actorBin`. |
| `WorkspaceManager` | `workspace.js` | WORKSPACE nodes + `actorBin`. Tree constructs both. |
| `tree-layout.js` | module | Slot math (sizes, gaps, tab wrap, mins). Header says no St/GObject; still `gi://GLib` + Meta-shaped mins. |
| `tree-snapshot.js` | module | T6 in-memory forest capture/restore. Descriptors hold **live Meta.Window**. |
| `tree-query.js` | module | DBus/CLI JSON projection (`projectForest`). Duck-types Node; no GObject. |

#### Node constructor — what a node owns

```text
proven  tree.js:Node constructor L120–168
        _type, _data, _parent, _nodes, mode, percent, userSized,
        _rect, tab, decoration, app, pointer, placeholder, zoomMode
        WINDOW → _initMetaWindow + compositor actor + _createWindowTab
        CON    → _createDecoration (St.BoxLayout)
```

| Field | Proven owner | Notes |
| --- | --- | --- |
| `_data` / `nodeValue` | heterogeneous | Comment L126–128: Meta.Window, id string (MONITOR/WS), or St.Bin (CON/ROOT). Placeholder stub is a fake Meta (`layout-placeholder.js:createPlaceholderStub`). |
| `_nodes` / `childNodes` | child list | Getter returns the **live** array. Setter still assigns `_nodes` (L218–220). |
| `_parent` / `parentNode` | parent | Setter L287–289 still public. |
| `mode` | Forge window mode | Default `WINDOW_MODES.DEFAULT` (L131). TILE/FLOAT/GRAB_TILE. **Not** proto `userSized`. |
| `percent` / `userSized` | H/V share | T4 comment L133–135: `userSized` only after explicit resize; auto percents stay false. Closest to proto float inverse. |
| `_rect` / `rect` | computed slot | Setter L192–208 **paints** CON/MONITOR/ROOT/WS `actor` size/position. WINDOW branch is a no-op. |
| `renderRect` | gap-inset slot | Set in `processNode` for WINDOW (L3565). FLOAT setter nulls it (L1057–1059). |
| `tab` | St tab chrome | WINDOW: `_createWindowTab` (L670). CON nested in tab/stack: `_ensureConTab` (L779). |
| `decoration` | St.BoxLayout | CON ctor L166–168 → `_createDecoration` L955: type `forge-deco`, `decoration.parentNode = this` (**St field**, not tree parent), attach via `DecorationManager`. |
| `_actor` / `windowActor` | Clutter | `meta.get_compositor_private()` (L151–161). |
| `actor` getter | mixed | WINDOW → `_actor`; CON/ROOT → `nodeValue` St.Bin; MONITOR/WS → `actorBin` (L175–190). |
| `app` | Shell.App | `_initMetaWindow` via `Shell.WindowTracker` + PWA heuristic (L589–607). |
| `placeholder` | AC4 flag | Ctor L141–155; `createPlaceholderLeaf` L3284. TILE reservation, no Meta apply. |
| `zoomMode` | presenter overlay | Ctor L143; `paintRectForWindow` L3237 uses `zoom.js`. |
| `lastTabFocus` | open leaf | Meta.Window (not id) on TABBED/STACKED. Set by group/tab/reveal. |
| `settings` | GSettings | **Not** in ctor. `createNode` / snapshot `createCon` assign `child.settings = this.settings`. `set float` reads it (L1054). |
| `layout` | CON/MONITOR/Tree | Not set in Node ctor. MONITOR set in `MonitorManager.addMonitor`. Tree ROOT = `LAYOUT_TYPES.ROOT`. |

#### `Tree extends Node` and IS the ROOT

```text
proven  tree.js:Tree constructor L1162–1179
        rootBin = new St.Bin(); super(NODE_TYPES.ROOT, rootBin);
        adds rootBin to global.window_group; layout = ROOT;
        owns extWm, MonitorManager, WorkspaceManager, focusUnit;
        _initWorkspaces()
proven  docs/dev/architecture.md L47–49
        “the Tree instance *is* the root node — there is no tree.root”
```

Implications vs proto Forest/ROOT:

| Forge | Proto (`tom/kernel.mjs`) |
| --- | --- |
| `Tree` **is** ROOT. Walk from `wm.tree`. `findNode(tree.nodeValue)` returns the Tree. | `createForest` L178–210: Forest is a **document** `{ rootId, nodes, monitors, focusId, … }`. ROOT is a POJO in `nodes`. |
| No `tree.root`. Methods for the whole forest hang on the root node. | TreeOps take `(f, node)` — forest is explicit. |
| `reload()` L1254: `this.childNodes.length = 0` then re-init WS/MONITOR. | Spine via `ensureSpine`; nodes stay in a map. |
| Cannot construct without `WindowManager` + `global.display`. | `makeNode` is a plain object (L117–130). |

`removeNode(tree)` is false: ROOT has no parent (`Tree-cleanup.test.js`).

#### Child-list APIs vs leftover setters (D023)

Canonical (contracts + `agents/project.md` § Tree child list):

- `appendChild` L300 — detach if parented, `push`, set `parentNode`
- `insertBefore` L342
- `removeChild` L468 — also **destroys** STACKED/TABBED decoration + child tabs
- `replaceChildren` L370 — drop unlisted, `appendChild` listed

Leftover:

```text
proven  tree.js L218–220  set childNodes(nodes) { this._nodes = nodes; }
proven  tree.js L287–289  set parentNode(node) { this._parent = node; }
proven  grep lib/         no `childNodes =` in product lib/
proven  tree.js L1260     reload(): this.childNodes.length = 0
                          (mutate live array; does not null children’s parentNode)
```

Who still **assigns** `childNodes` / `parentNode` outside Node methods:

- **Product `lib/extension`:** no `childNodes =`. `parentNode =` only inside
  Node (`appendChild` / `insertBefore` / `removeChild`) plus
  `decoration.parentNode = this` (L962, St actor tag).
- **Bypass without setter:** `reload` `childNodes.length = 0`. Getter
  returns `_nodes`, so `push`/`splice`/`length=` still work.
- **Tests still assign:** `tests/unit/tree/Tree-layout.test.js` (many),
  `tests/unit/workspace/WorkspaceManager.test.js`,
  `tests/unit/extension/open-min-place.test.js`,
  `tests/unit/command/CommandHandler.test.js`, several regressions.

Archived child-list plan claimed `split`/`swapPairs` still write slots.
**Stale.** Current `split` is `insertBefore` + `appendChild` (L2911–2912).
`swapPairs` uses `replaceChildren` / insert (L3008–3020).

`contains()` (L313–317) is **value** search (`getNodeByValue`), not
identity. `removeChild` must use `node.index` (L497–502, forge-mo27).

#### Tree method map (structure vs policy vs paint)

**TreeOps-shaped (child list / wrap / prune / percents)**

- `createNode`, `createPlaceholderLeaf`
- `appendChild` / `insertBefore` / `removeChild` / `replaceChildren` (on Node)
- `split` (wrap one node in CON; or **toggle** parent H↔V when lone child)
- `slotSplitUnit` (wrap when H/V parent already has siblings)
- `ungroup` (promote children to grandparent — Mark 2 **PromoteChildren**, one CON)
- `swapPairs` (reorder + **also** `extWm.move` frames)
- `removeNode` (detach + collapse last-child CON + auto-exit-tabbed + reorient)
- `cleanTree` (empty CON + DING leaves + flatten CON-in-CON only)
- `pruneDeadWindows`
- `resetSiblingPercent` / `insertChildPercent` / `redistributeSiblingPercent`
  (thin wrap of `tree-layout.js`)
- `setLayout` (I1 field write; Tree variant also equalizes on TABBED/STACKED)

**OpSet / product policy (not kernel)**

- `move` / `_nextMoveCandidate` / `_finishMove` / `next` / `nextMonitor`
  — Forge directional move: sibling swap, insert, cross-mon Meta
  `move`+reparent, edge wrap on **own** MONITOR. **Not** Mark 2 Move
  (in-axis swap / rotate / breakout / settle).
- `group` / `mergeWindowsIntoGroup` / `insertWindowIntoGroup` /
  `_resolveGroupLayout` — Join-ish; prefs pick TABBED vs STACKED.
- `swap` / `swapSibling` — min-overflow skip + same-mon guard.
- `focus` / `focusSibling` / `_activateWindowNode` — Meta raise/focus +
  Wayland transient `make_above`.
- `focusParent` / `focusChild` / `moveIn` / `moveOut` (C4) + `focusUnit`
- `layoutUnit` / `resolveOwningSplit` (I3 resize target)
- `auto-exit-tabbed` / `_reorientOnClose` / empty-MONITOR layout reset
  inside `removeNode`
- `_finishMove` invents parent H/V from group rect after peel-to-pair

**Presenter / host (paint, actors, Meta)**

- `render` / `processNode` / `processSplit` / `processStacked` /
  `processTabbed` / `_applyDecorationRect` / `_ensureDecoration`
- `apply` / `paintRectForWindow` (zoom overlay)
- Node `_createDecoration` / `_createWindowTab` / `_activateFromTab` /
  `set float` (`make_above`)
- Tree ctor: `St.Bin` + `window_group`; `destroy` / `_removeScaffoldBins`
- `stackedBarHeight` / `tabPosition` / `measureMinTabWidth` (St/Pango)

**Epochs (writers of recovered TOM)**

- `snapshotTree` / `restoreTree` / `restoreTreeIfNeeded`
- `snapshotLayoutGroups` / `restoreLayoutGroups` /
  `restoreLayoutGroupsIfUnwrapped` (older group-only path; T6 preferred)

**Host spine**

- `addWorkspace` / `removeWorkspace` / `addMonitor` (delegates)
- `_initWorkspaces`, `reload`

#### Float: two meanings

```text
proven  Node.set float L1046–1088  mode = FLOAT|TILE; Meta make_above;
                                  renderRect/_rect nulled on FLOAT
proven  architecture.md L54–55     “Float state is the node's mode, not
                                  tree membership — a floating window
                                  keeps its node”
proven  tom/sizing.mjs L1–4        “Float = not userSized; remaining
                                  space splits equally”
```

| Word | Forge | Mark 2 / proto |
| --- | --- | --- |
| **float** | `mode === FLOAT`: unmanaged by slots; skipped by `getTiledChildren` / `apply`; still in the tree | **not `userSized`**: still tiled; leftover share splits equally |
| **userSized** | T4: explicit resize/expand/golden | Inverse of proto float |
| **GRAB_TILE** | mid-drag; not a proto kind | — |

Do not port Forge `mode` FLOAT into proto float chords. Product FLOAT is
Host/OpSet “leave the grid.” Proto float is sizing policy.

#### MONITOR children vs Mark 2 max-1

```text
proven  mark2.md L16–21, invariant 1
        MONITOR may be empty; at most one child
proven  monitor.js:addMonitor L55–70
        one MONITOR node per output; layout from geometry
proven  tree.js:processNode L3464–3554
        MONITOR is laid out like CON: H/V/TABBED/STACKED over
        getTiledChildren — N children
proven  tree.js:split L2889–2900
        lone child of parent → toggle parent.layout (MONITOR can be
        that parent)
proven  tree.js:removeNode L3089
        last-child collapse skips MONITOR (MONITOR may be empty)
```

Forge MONITOR **is** a Forge container that may have many WINDOW/CON
children. Mark 2 MONITOR is a spine Forge container with **max-1**.

```text
Forge:   Mon1(A, B, C)           three WINDOW siblings, MONITOR.layout=HSPLIT
Mark 2:  Mon1(H(A,B,C))          one child CON
```

Import consequence: either wrap Forge multi-child MONITOR into a CON on
lift, or keep a Forge OpSet that allows MONITOR n-children (second
glossary — meeting forbids that). Default: **reshape to Mark 2 max-1**
and treat current MONITOR-as-split as a presenter/compat shim.

#### Unary collapse / cleanTree vs proto cleanupStructure

Mark 2 unary collapse: CON with exactly one child → child takes CON’s
place; MONITOR/WS/ROOT never collapse. `cleanupStructure` = prune empty
CONs + unary, repeat (`composed.mjs` L184–235).

Forge pieces (none is unary collapse):

| Mechanism | What it does | Gap vs Mark 2 |
| --- | --- | --- |
| `cleanTree` L3321 | (1) remove empty CONs; DING fake windows; (2) flatten **CON whose only child is CON**, inherit layout | Does **not** collapse `CON(WINDOW)` |
| `removeNode` L3089 | If parent has 1 child and is not MONITOR, **delete the parent CON** with the closing window | Close-path only; not peel/move |
| `resetLayoutSingleChild` L1119 | TABBED/STACKED with ≤1 child → `setLayout(HSPLIT)` | Keeps unary CON |
| `auto-exit-tabbed` L3101 | Pref: TABBED with 1 child remaining → H/V + destroy decoration | Policy; unary CON remains |
| `rebuildNode` snapshot L279–287 | Restore-time: 1 surviving child CON collapses to that child | Epoch only |

Called from `Tree.render` (re-layout if mutated) and
`window.js` overflow rehome (~L4818).

Contracts: do **not** use `cleanTree` / auto-exit-tabbed as product
**ungroup** (ungroup = `tree.ungroup`).

#### GObject.registerClass — why this cannot be shared TOM

```text
proven  Node L116–118, Queue L1134–1136, Tree L1157–1159
        static { GObject.registerClass(this); }
proven  tree.js L20–24  gi:// Clutter, GObject, Meta, Shell, St
proven  tree.js L33     import * as Window from "./window.js"
                        (cycle: window.js imports Tree)
```

- Requires GJS + mocks; proto tests are Node/`tom/` gi-free.
- Instance **is** a GObject, not a POJO (`id` / `parentId` / `childIds`).
- Ctor side effects: WindowTracker, St tabs/decoration, `window_group`.
- `removeChild` is not a pure detach — it destroys actors.
- `Queue` registered as GObject for a JS array.

TOM must be proto-shaped (plain nodes + forest document). Forge `Node` /
`Tree` stay a **host+presenter adapter** until discarded.

#### snapshot / query — closer to a forest?

**tree-snapshot.js — closer, not TOM.**

- `captureForest` / `captureMonitor` / `captureNode`: `{ version, monitors[] }`
  with layout, percent, userSized, lastTabFocus, children.
- WINDOW descriptor is `{ window: Meta.Window, percent, userSized }` —
  live GObject, not an id (L33–37).
- Restore uses Node APIs (`appendChild`, `replaceChildren`) via ctx
  `createCon` which still `new Node(CON, new St.Bin())` (`Tree._treeSnapshotCtx`
  L1335–1338).
- `resolveTargetMonitor` is H1 **majority** policy (do not merge with
  session `resolveStrictMonitor`).
- `rebuildNode` unary-collapses 1-child CONs (restore-only).
- `pruneEmptyConsUnder` ≈ proto `pruneEmptyCons`.

**tree-query.js — closest to a pure projection.**

- `projectNode` / `projectForest`: JSON with `nodeType`, layout, rect,
  percent, userSized, children, windowId, lastTabFocusId.
- No GObject; duck-types `childNodes`. Used by DBus GetTree / CLI.
- Still reads Meta via `windowMetaFields` at project time.
- Forest here = MONITOR list, not ROOT/WS spine (optional
  `activeWorkspace` / `nWorkspaces` on the document).

---

### Intended layer vs actual layer

Use target names from `explore/00-scheme.md`. Contamination is the point.

| Object | Intended | Actual today |
| --- | --- | --- |
| `NODE_TYPES` / kinds / `percent` / `userSized` / `lastTabFocus` / child list | **TOM** | On GObject Node; `lastTabFocus` is Meta.Window |
| `appendChild` / `insertBefore` / `removeChild` / `replaceChildren` | **TreeOps** | TreeOps + **presenter teardown** (destroy decoration/tabs) |
| `split` / `ungroup` / percent helpers / empty prune | **TreeOps** | Mix: `split` toggles MONITOR layout (OpSet); percents OK |
| `move` / `group` / auto-exit / reorient / C4 moveIn | **OpSet** | Methods on Tree (ROOT) |
| `processNode` / `apply` / decoration / tab / `rect` setter | **Presenter** | Methods on Tree/Node |
| `mode` FLOAT / GRAB_TILE / Meta `make_above` | **Host** + product float policy | Node setter |
| `MonitorManager` / `WorkspaceManager` / `actorBin` | **Host** | Constructed by Tree |
| T6 snapshot / `restoreTreeIfNeeded` | **Epochs** | Thin wrap + Meta.Window keys |
| `tree-query` `projectForest` | **Surfaces** | Already a projection |
| `focusUnit` | proto **selection** | Tree field; C4 OpSet |
| `layoutUnit` | TOM query (bag slot) | Tree method; I3 |
| `zoomMode` | Presenter view | Node field |
| `placeholder` | Epoch/apply reservation | WINDOW node + stub Meta |
| `tree-layout` sizes/gaps | Presenter slot math (inputs from TOM percents) | Also mins persist / GLib env — **product data + host** |
| `Queue` | n/a | Discard with BFS rewrite |

**TOM is the same tree in proto and Forge** (scheme). Forge `Tree` is
not that TOM. Lift proto; adapt Forge surfaces onto it.

---

### Strengths (keep)

- **D023 child-list contract is real in product:** `lib/extension` no
  longer assigns `childNodes =`. Restore/reorder go through
  `replaceChildren` (`applyMonitorSnapshot`, `restoreLayoutGroups`,
  `swapPairs`).
- **Named FCC ops exist:** `setLayout` (I1, no flatten), `group` /
  `ungroup` (I2), `moveIn`/`moveOut` / `focusParent`/`focusChild` (C4),
  `layoutUnit` / `resolveOwningSplit` (I3). Catalog rows match symbols.
- **T6 snapshot is a forest document** (monitors + recursive CON/WINDOW)
  with percent/userSized/lastTabFocus — the right *shape* for epoch
  restore, even though leaves are Meta.
- **tree-query is already a gi-light projection** (`TREE_QUERY_API_VERSION`).
- **tree-layout extracted slot math** (split/stack/tab rects, percent
  write-back rules, min redistrib). Presenter can keep this.
- **Float keeps tree membership** (architecture L54–55) — good for
  peel/re-tile; do not drop nodes on FLOAT.
- **Placeholder is a first-class TILE leaf** (AC4) — reservation belongs
  in TOM as a WINDOW-kind with a flag, not a paint hack.
- **MONITOR never unary-deleted** (`removeNode` skip) — matches Mark 2
  “MONITOR never unary-collapses,” even though child *count* differs.

---

### Weaknesses / duck-tape

| Failure class | Symptom in code | Why the abstraction is wrong |
| --- | --- | --- |
| God-object ROOT | `Tree` is ROOT **and** OpSet **and** presenter **and** host ctor | Kernel cannot be tested/shared; every import of “the tree” pulls Mutter |
| Model owns paint | Node ctor builds St tabs/decoration; `rect` setter moves actors; `removeChild` destroys chrome | Detach ≠ unpaint. TreeOps cannot run headless |
| Model owns Meta | `_data` is Meta.Window; `set float` calls `make_above`; `apply` `move_resize` | TOM must key WINDOW by id; Host binds Meta |
| Policy in kernel | `move`, auto-exit-tabbed, peel-to-pair layout invent, prefs in `_resolveGroupLayout` | Mark 2 Move/Join/settle live in OpSet; Forge move is a different op with the same English word |
| Incomplete unary | `cleanTree` only CON-in-CON; `CON(W)` remains; auto-exit keeps HSPLIT unary | Mark 2 settle is one function; Forge has four partials + prefs |
| MONITOR n-children | MONITOR laid out as split; `split` toggles MONITOR.layout | Mark 2 invariant 1 (max-1) is not true of this tree |
| Live array + leftover setters | getter = `_nodes`; `reload` `length = 0`; setters still public | D023 is a convention, not an encapsulation |
| Value `contains` | `getNodeByValue` identity bugs (mo27) | TreeOps need pointer/id equality |
| Cycle + GObject | `tree.js` ↔ `window.js`; `registerClass` | Shared TOM cannot import this module |
| Two floats | `mode` FLOAT vs `userSized` | Same word, opposite layers |
| Snapshot keys Meta | T6 `{ window: Meta.Window }` | Epoch restore cannot survive process without Host map |
| `nodeWorkpaces` typo | getter L1237 | Every test copies the misspelling |
| `LAYOUT_TYPES.PRESET` | enum only | Dead token in the model |
| `Queue` as GObject | BFS helper | Noise in the “model” file |

---

### Twins / bypasses

Catalog: `docs/dev/contracts.md`. Named vs hand-rolled:

| Job | Named | Twin / leftover |
| --- | --- | --- |
| Child list | `appendChild` / `insertBefore` / `removeChild` / `replaceChildren` | Setters still exist; `reload` `childNodes.length = 0`; tests assign `childNodes =` |
| Ungroup | `tree.ungroup` | `cleanTree` flatten; auto-exit-tabbed; `removeNode` last-child CON delete. Contracts say do not use those as ungroup |
| Group | `tree.group` → `mergeWindowsIntoGroup` | Do not flip `parent.layout` in DnD (catalog). `_finishMove` still assigns `parentTarget.layout` (L1992) |
| setLayout | `tree.setLayout` / `Node.setLayout` | Direct `parentNode.layout =` in `split` toggle (L2895), `cleanTree` inherit (L3385), `_finishMove` (L1992), snapshot `mon.layout =` |
| Split | `tree.split` | Callers must not hand-build CON + splice (catalog). `split` itself is wrap **or** layout toggle |
| Move | `tree.move` | **Not** Mark 2 Move. command.js `Move` → `wm.tree.move` (command.js ~L162). Proto Move is swap/rotate/breakout |
| Show tab | `wm.revealGroupChild` | Node `_activateFromTab` calls it; fallback writes `parent.lastTabFocus` (L896–906) |
| Forest restore | `applyMonitorSnapshot` / `restoreTreeIfNeeded` | Older `restoreLayoutGroups` still present for bqa tests |
| Monitor resolve | `tree-snapshot.resolveTargetMonitor` (majority) | Session `resolveStrictMonitor` — **keep dual** (design.md) |
| Percent repair | `resetSiblingPercent` (wipe) vs `renormalizeChildPercents` (scale) vs `redistributeSiblingPercent` | Three names; archived plan said do not merge casually |
| Identity search | `findNode` / `getNodeByValue` | `contains` uses value; `removeChild` uses identity index |

---

### Import recommendation

Feeds `import-map.md`. Per major type:

| Type | Rec | Why |
| --- | --- | --- |
| `NODE_TYPES` / `LAYOUT_TYPES` (minus PRESET) | **keep** names | Same words as Mark 2. Drop PRESET. |
| `Node` class | **discard** as TOM; **reshape** fields into proto node | Kinds + percent + userSized + lastTabFocus + placeholder flag **port** as data. GObject/Meta/St/tab/decoration/actor/mode-FLOAT **do not**. |
| `Tree` class | **discard** as kernel | ROOT-as-class + WM hub. Replace with proto Forest document + Host adapter that *holds* a forest. |
| `Queue` | **discard** | JS array. |
| Child-list methods | **port** behavior | Align with proto `atomics.mjs` (already named the same). Drop actor teardown from detach. |
| `split` wrap | **reshape** | TreeOp wrap; lone-child H↔V toggle is OpSet (`ToggleSplit`), not wrap. MONITOR wrap must respect max-1. |
| `ungroup` | **port** | = Mark 2 PromoteChildren (one CON). Refuse when CON is MONITOR’s only child (Mark 2). |
| `group` / `mergeWindowsIntoGroup` | **reshape** | Product Join surface; invent-layout prefs stay OpSet. |
| `move` / `next` / `swap` | **park** then **reshape** | Forge Move is a different OpSet than Mark 2. Do not rename it Move in the kernel. Import as a later Forge OpSet or replace with Mark 2. |
| C4 `focusParent` / `moveIn` / `layoutUnit` | **port** (queries + small TreeOps) | `focusUnit` ≈ proto `selectionId`. `layoutUnit` is bag-slot query. |
| `setLayout` I1 | **port** | Matches proto `setLayout` / `setLayoutTiling`. |
| `cleanTree` / auto-exit / `_reorientOnClose` | **discard** as kernel; **reshape** settle | Replace with proto `cleanupStructure` + OpSet prefs. |
| `render` / `process*` / `apply` / decoration/tab | **park** on Presenter | Next note (`04-presenter`). Do not put on TOM. |
| `set float` / `mode` | **park** Host/product | Distinct from proto float. |
| `tree-layout.js` slot math | **port** to Presenter | split/stack/tab rects, percent compute. |
| `tree-layout.js` mins / class floor / GLib | **reshape** | Product data + host learn; not TOM. |
| `tree-snapshot.js` | **reshape** | Keep forest document + `replaceChildren` apply. Key WINDOW by id. `createCon` → TOM wrap. Keep `resolveTargetMonitor` as **Epoch** (H1). |
| `tree-query.js` | **keep** / **port** | Surface projection onto TOM. Already duck-typed. |
| `enum.js` | **keep** | Tiny helper; or inline. |

---

### Entry points for later agents

- Child list / identity: `Node.appendChild|insertBefore|removeChild|replaceChildren`; tests `tests/unit/tree/Node.test.js`.
- Tree-as-ROOT: `Tree` ctor L1162; walk `wm.tree` / `tree.nodeWorkpaces` (typo).
- Create leaf: `Tree.createNode(parentObj, type, value, mode)`; PH: `createPlaceholderLeaf`.
- Named FCC: `setLayout`, `group`, `ungroup`, `moveIn`/`moveOut`, `focusParent`/`focusChild`, `layoutUnit`, `split`, `slotSplitUnit`.
- Directional keybind move: `command.js` `Move` → `tree.move` (not Mark 2).
- Render/apply: `Tree.render` → `processNode(this)` → `apply(this)` → maybe `cleanTree` + second pass.
- Slot math: `tree-layout.js` `computeSizes` / `splitChildRect` / `tabbedChildRect`.
- T6: `tree.snapshotTree` / `restoreTreeIfNeeded` → `tree-snapshot.js`.
- CLI/DBus tree: `tree-query.js` `projectForest`.
- Tests: `tests/unit/tree/*` (Tree/Node ops); `tests/unit/extension/tree-snapshot.test.js`; `tree-query.test.js`; layout math in `tests/unit/tree/Tree-layout.test.js` (fixtures still assign `childNodes`).
- Proto twin: `prototypes/container-motion/src/tom/` — `kernel.mjs` forest, `atomics.mjs` child list, `composed.mjs` unary/cleanup.

---

### Open questions

1. **MONITOR max-1 on lift:** wrap existing n-child MONITOR into one CON
   automatically, or keep a compatibility OpSet? Blocks TOM invariant 1.
2. **Forge `move` vs Mark 2 Move:** replace with Mark 2 on import, or
   park Forge Move as a second OpSet? Blocks OpSet assignment of
   `Tree.move`.
3. **WINDOW identity in TOM:** Meta.Window vs stable windowId vs both
   during adapter period? Blocks snapshot reshape.
4. **Unary on live Forge desk:** collapsing leftover `CON(WINDOW)` will
   change chrome/split toggles (`split` uses lone-child parent). Need an
   explicit migrate vs keep-unary-until-OpSet-settle.
5. **`focusUnit` vs proto `selectionId`:** same idea? C4 can select a CON;
   Mark 2 v1 Move/Join act on WINDOW leaf. Blocks C4 import vs park.
6. **Placeholder kind:** WINDOW+flag (today) vs TOM kind? Blocks apply
   epoch TOM shape.
7. **`lastTabFocus` storage:** Meta.Window vs id (query already emits
   `lastTabFocusId`). Blocks pure TOM.

---

### Do-not-rescan traps

- **`Tree` *is* ROOT.** No `tree.root`. `super(NODE_TYPES.ROOT, rootBin)`.
- **`childNodes` setter still exists** (L218). Product does not use it;
  **getter returns the live array** so `length = 0` / splice still mutate.
- **`reload()` `this.childNodes.length = 0`** — does not clear
  `parentNode` on dropped children.
- **`parentNode` setter still exists**; `decoration.parentNode = this`
  is an St tag, not tree parent.
- **`contains()` is nodeValue equality**, not identity (mo27).
- **`nodeWorkpaces` is misspelled** (no “s” in Workspaces). Do not
  “fix” without a sweep.
- **Two floats:** Forge `mode` FLOAT (unmanaged) ≠ proto float
  (`!userSized`). Forge also has `userSized` (T4).
- **MONITOR may have many children;** Mark 2 MONITOR max-1. `split` on
  a lone MONITOR child **toggles MONITOR.layout**.
- **`cleanTree` ≠ unary collapse.** Only empty CON + CON-in-CON
  flatten. `CON(W)` stays. auto-exit-tabbed keeps unary HSPLIT CON.
- **`removeChild` destroys tab chrome** — cannot be a pure TreeOp.
- **GObject.registerClass** on Node/Tree/Queue + **cycle**
  `tree.js` ↔ `window.js`.
- **`NODE_TYPES` lives in `tree.js`**, not `enum.js`.
- **`LAYOUT_TYPES.PRESET` is dead.**
- **T6 descriptors hold live `Meta.Window`**, not ids.
- **H1 `resolveTargetMonitor` (majority) ≠ session
  `resolveStrictMonitor`.** Do not merge.
- **Three percent repair helpers:** wipe (`resetSiblingPercent`) vs
  scale (`renormalizeChildPercents` / `redistributeSiblingPercent`).
- **`Queue` is a GObject** used only for BFS.
- **Tests still assign `childNodes =`** — not proof that product may.
- **English “move” in command.js is `tree.move`**, not Mark 2 Move
  (breakout/rotate/settle).
- **`focusUnit` is elevated CON selection** on Tree; `layoutUnit` walks
  up TABBED/STACKED to the bag. Do not conflate with keyboard focus or
  `lastTabFocus` (open leaf).
)
