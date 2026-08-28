# Prototype Tiling Object Model

**As of:** 2026-08-27
**Author:** explorer
**Domain:** proto TOM (`prototypes/container-motion/src/tom/`)

Meeting lock: option 2 — kernel-first, then import
([forge-firm-abstractions.md](../forge-firm-abstractions.md)).
Glossary: [mark2.md](../../../../prototypes/container-motion/src/opsets/mark2.md).
D073: TOM + TreeOps + OpSets; shorthand is lingua franca, not a product DSL.

---

### Scope

Opened (all of proto `src/tom/`, OpSet boundary, presenter extras, tests):

- `prototypes/container-motion/src/tom/{index,kernel,atomics,composed,queries,sizing,api,shorthand}.mjs`
- `src/opsets/{mark2.md,mark2.mjs,transact.mjs,index.mjs}`
- `src/{tree,monitors,render-desk,render-tree,main,keybinds,presets,storage}.mjs`
  (enough to prove presenter ≠ TOM)
- `test/{run,harness,cases-*}.mjs` (suite ownership; not every case body)
- Proto README, D073/D074, `lib/shared/package.json` (GJS vs Node shape)
- `docs/dev/contracts.md` child-list row (claimed catalog vs proto names)

Did **not** open: Forge `lib/extension/tree.js` beyond NODE_TYPES header,
`window.js`, apply/recovery, product JS. Those are later domain notes.

---

### Current objects (as the code is)

#### Data model

**proven**  `kernel.mjs` Node (~L20–32) is a plain object (no GObject, no
Meta, no DOM). Fields:

| Field | Role |
| --- | --- |
| `id` | string; factory ids `n1…`; spine uses `"ROOT"`, `"WS1"`, geom `id` |
| `kind` | `ROOT` \| `WORKSPACE` \| `MONITOR` \| `CON` \| `WINDOW` |
| `layout` | CON/MONITOR: `HSPLIT` \| `VSPLIT` \| `TABBED` \| `STACKED` |
| `label` | WINDOW letter; MONITOR display name |
| `wmClass` | WINDOW toy class (`"app"`) |
| `percent` | in-axis share; default `1` until a parent equalizes |
| `userSized` | default `false` = floater |
| `parentId` | string or `null` |
| `childIds` | ordered id list (Forge calls this `childNodes`) |
| `lastTabFocusId` | TAB/STACK open child (Forge: `lastTabFocus`) |
| `geom` | MONITOR only: `{id,x,y,width,height,primary?}` |
| `_pendingChildren` | factory scratch; deleted in `registerTree` |

**proven**  Forest (`kernel.mjs` ~L43–51) is the document object. JS still
calls it a forest; the tree root node is `ROOT`.

| Field | Role |
| --- | --- |
| `rootId` | `"ROOT"` |
| `nodes` | `Record<id, Node>` — every live node |
| `monitors` | parallel array of MONITOR nodes (not derived from spine) |
| `focusId` / `selectionId` | WINDOW leaf vs CON-or-leaf selection |
| `mergeTags` | Mark 1 wrap-with-tags leftover |
| `decisions` | OpSet/session prefs hanging on the document |
| `_seq` | id factory cursor |

**proven**  Spine from `createForest` (`kernel.mjs:createForest` ~L178–210):

```text
ROOT → WS1 → MONITOR* → CON | WINDOW → …
```

`ensureSpine` (`kernel.mjs:ensureSpine` ~L218–245) reattaches ROOT/WS1 if a
cloned/saved TOM lost them. Proto hardcodes **one** workspace (`WS1`).
Shorthand prints monitors only.

**proven**  `defaultDecisions` (`kernel.mjs:defaultDecisions` ~L59–68) is
**policy**, stored on Forest:

- `peelModel: "B"` — presenter `tree.mjs` peel only
- `edgeMove: "wrap"` — Mark 2 Move
- `aspectTieBreak: "HSPLIT"` — square invent / launch
- `defaultJoinContainer: "SPLIT"` — Join wrap invent
- `policyEnabled: true` — Mark 2 vs presenter TreeOp
- `opsetId: "mark2"`

MONITOR is created with `layout: "HSPLIT"` even though it is a spine
container, not a CON (`createForest` ~L197–203). `queries.mjs:isInAxis`
treats MONITOR as left/right (~L29–30).

#### Kernel modules

| Name | file:symbol | What it actually does |
| --- | --- | --- |
| barrel | `tom/index.mjs` | Re-exports kernel + queries + atomics + composed + sizing + `createTomApi` + shorthand |
| factories / walk | `kernel.mjs:createForest` `makeNode` `makeCon` `makeWindow` `registerTree` `get` `parent` `children` `walk` `cloneForest` `applyForestSnapshot` | Data + pointer queries. `cloneForest` JSON-roundtrips then remaps `monitors` to `nodes[id]` |
| focus | `kernel.mjs:setFocus` `setSelection` `markOpenLeaf` | Focus writes `selectionId` too; walks up TAB/STACK to set `lastTabFocusId` |
| atomics | `atomics.mjs:appendChild` `insertBefore` `insertAfter` `removeChild` `replaceChildren` `replaceChild` `detach` | Child-list splice. Each mutator calls `clearShareOnLeave` + `repairSharesAfterChildChange`. **No** unary collapse, **no** MONITOR max-1 |
| attributes | `atomics.mjs:setLayout` `setPercent` `setUserSized` `setLastTabFocus` | Field writes. `setLayout` allows CON **and** MONITOR; does not equalize |
| destroy | `atomics.mjs:destroyNode` | Unlink + drop subtree from `nodes`. Refuses MONITOR/ROOT/WS. No settle |
| seed | `atomics.mjs:setChildren` | `registerTree` + `replaceChildren` + equal percents / `userSized=false` |
| queries | `queries.mjs:isInAxis` `siblingInDir` `dirSide` `ancestorMonitor` `preferredLeaf` `rightmostLeaf` `findConTarget` | Topology. **No** neighbor-monitor geometry (that is `monitors.mjs`) |
| composed | `composed.mjs:swapSiblings` `rotateChild` `breakout` `wrapNodes` `promoteChildren` `pruneEmptyCons` `collapseUnary` `cleanupStructure` `equalizeChildren` `setLayoutTiling` | Builds of atomics. `cleanupStructure` = prune + unary, **no** same-type coerce |
| sizing | `sizing.mjs` (`SIZE_MIN=0.1`, `nudgeSize`, `floatCombo`, `paneRect`, …) | H/V shares. Floor 10% is here. `paneRect` needs MONITOR `geom` |
| facade | `api.mjs:createTomApi` | Id factory + named TreeOps + **selection-aware** wrap/ungroup/flatten/close/focusParent/focusChild/`setLayout`/`equalizeChildren` |
| shorthand | `shorthand.mjs:buildGiven` `parseAction` `serializeForest` | Given/Actions/Expect parser. Uses `createTomApi`, not presenter |

#### OpSet vs presenter (not TOM)

| Name | file:symbol | What it actually does |
| --- | --- | --- |
| Mark 2 SurfaceOps | `opsets/mark2.mjs:mark2Move` `mark2Join` `mark2Launch` `mark2ToggleSplit` `mark2ToggleTabStack` `mark2Promote` `mark2PromoteRecursive` `mark2Remove` | Named control surface. Calls TreeOps; does not splice `childIds` except via atomics. **Does** hand-roll wrap/promote-join (twins below) |
| settle | `mark2.mjs:mark2CleanupUnder` `mark2CleanupForest` | prune + unary + `coerceSameTypeUnder`, loop ≤32 |
| invent | `mark2.mjs:layoutForJoinWrap` `preferredJoinLayout` `coerceDifferentType` | Join wrap layout + same-type → TAB |
| txn | `opsets/transact.mjs:runOpAbstract` | `cloneForest` → fn(draft) → `applyForestSnapshot` if ok. Presenter paints after |
| registry | `opsets/index.mjs:getOpSet` `MARK2_OPSET` | One OpSet today |
| World | `monitors.mjs:neighborMonitor` `isAtMonitorEdge` `transferLeafToMonitor` | Geometry neighbor + **max-1 wrap/enter** on transfer |
| Presenter API | `tree.mjs:createTreeApi` `presenterOps` | Spreads TomApi + launch (policy-off), `focusDir`, `moveDir` (in-axis swap only), `swapDir`, peel `moveOut`/`moveIn`, `group`, `createGroup`, `cycleLayout` |
| HTML desk | `render-desk.mjs:renderDesk` `renderNode` | DOM flex from `percent` + TAB/STACK chrome. Own paint of `lastTabFocusId` |
| Tree graph | `render-tree.mjs:renderTreeGraph` | cytoscape; skips selecting ROOT/WS |
| Keys / app | `keybinds.mjs` `main.mjs` | Surface. `policyEnabled` chooses Mark 2 vs `api.moveDir` / `api.launch` |
| Persist | `storage.mjs` | `localStorage` `forge.container-motion.v1` — presenter |

#### Tests (what each file owns)

| File | Layer tag | Owns |
| --- | --- | --- |
| `test/cases-shorthand.mjs` | `shorthand` | Parser round-trip, aliases, implicit Mon1 |
| `test/cases-atomics.mjs` | `atomics` | Child-list, destroy, spine, MONITOR multi-child **allowed** |
| `test/cases-composed.mjs` | `composed` | swap/rotate/breakout/wrap/promote/unary/prune; **breakout of mon sole-child leaf allowed** |
| `test/cases-mark2.mjs` | `opset` | Every Move/Join mode + Launch edges + promote refuse |
| `test/cases-workflows.mjs` | `workflow` | Capability Given→Expect; `byOpSet.mark2` sequences |
| `test/cases-sizing.mjs` | mostly `atomics`, two `opset` | Shares, floor, float chords, leave-reset, unary keeps CON slot |
| `test/harness.mjs` | — | `buildGiven` + `runStep`. OpSet actions go through `runOpAbstract` |
| `test/run.mjs` | — | Node runner. `npm test -- wrap-h` filters by id |

**proven**  `harness.mjs:runStep` Swap/Focus/Group/MoveIn/MoveOut/CycleLayout
need presenter `TreeApi` (`failNeed` ~L150–152). Kernel tests use
`createTomApi` via `buildGiven`, so those actions are not in the TOM suite.

---

### Intended layer vs actual layer

Target names from [00-scheme.md](./00-scheme.md).

| Object | Intended | Actual | Contamination |
| --- | --- | --- | --- |
| `Forest` + `Node` | **TOM** | TOM | `decisions`, `mergeTags`, MONITOR `geom`, `nextAppLabel` |
| atomics / composed / sizing (mutators) | **TreeOps** | TreeOps | Sizing uses `geom` for `paneRect` / wrap-min (world) |
| `queries.mjs` | TOM/TreeOps | TOM queries | Clean. `parentAxis` vs `isInAxis` disagree on STACKED (below) |
| `createTomApi` wrap/ungroup/flatten/close/focus* | TreeOps convenience | Mix | Selection-aware; `wrap` reads `mergeTags` |
| `shorthand.mjs` | tests/chat | lives in `tom/` | Not a SurfaceOp; D073: not a product DSL |
| Mark 2 `mark2*.mjs` | **OpSet** | OpSet | Imports World `monitors.mjs` for cross-mon |
| `mark2Cleanup*` + coerce | OpSet settle | OpSet | Correct place; unary itself is TreeOps |
| `runOpAbstract` | OpSet txn | OpSet | Clean |
| `transferLeafToMonitor` | TreeOps + OpSet wrap rule | **World** | README known seam |
| `tree.mjs` peel/group/focusDir/launch | **Presenter** (or old SurfaceOps) | Presenter | `peelModel` still on Forest |
| `render-desk` / `render-tree` | **Presenter** | Presenter | DOM/cytoscape only |
| `keybinds.mjs` `main.mjs` | **Surfaces** | Surfaces | Proto keys omit Super |
| MONITOR max-1 | OpSet invariant after settle | OpSet + World transfer | Atomics **allow** `Mon1(A,B)` |

#### 1. Exact TOM data model

**proven**  See table above. Not a second tree: one `nodes` map + `parentId` /
`childIds`. `f.monitors` is a convenience index that **must** stay aligned
with WS children (`cloneForest` remaps; atomics that created a MONITOR
without pushing `f.monitors` would drift — no such factory in proto).

#### 2. Atomic vs composed vs OpSet vs presenter

| Op | Layer | file:symbol |
| --- | --- | --- |
| append/insert/remove/replace | atomic | `atomics.mjs:appendChild` `insertBefore` `insertAfter` `removeChild` `replaceChildren` `replaceChild` |
| detach + float share | atomic | `atomics.mjs:detach` → `sizing.mjs:clearShareOnLeave` |
| setLayout field | atomic | `atomics.mjs:setLayout` |
| destroy (no settle) | atomic | `atomics.mjs:destroyNode` (`TomApi.deleteNode`) |
| swap / rotate | composed | `composed.mjs:swapSiblings` `rotateChild` |
| breakout = promote (one node) | composed | `composed.mjs:breakout` |
| wrap members in new CON | composed | `composed.mjs:wrapNodes` |
| dissolve CON (kids take slot) | composed | `composed.mjs:promoteChildren` |
| unary collapse / prune | composed | `composed.mjs:collapseUnary` `pruneEmptyCons` |
| generic cleanup | composed | `composed.mjs:cleanupStructure` (no coerce) |
| shares / float / nudge / 10% | TreeOps | `sizing.mjs:*` |
| Move / Join / Launch / Toggle* / Promote* / Remove | OpSet | `mark2.mjs:mark2Move` … `MARK2_OPSET.ops` |
| Mark 2 settle | OpSet | `mark2.mjs:mark2CleanupUnder` |
| same-type coerce | OpSet | `mark2.mjs:coerceSameTypeUnder` |
| clone/commit | OpSet txn | `transact.mjs:runOpAbstract` |
| cross-mon neighbor | World | `monitors.mjs:neighborMonitor` |
| transfer + max-1 wrap | World+policy | `monitors.mjs:transferLeafToMonitor` |
| policy-off launch | Presenter | `tree.mjs:presenterOps.launch` |
| in-axis swap only | Presenter TreeOp | `tree.mjs:moveDir` |
| peel A/B | Presenter | `tree.mjs:moveOut` (`peelModel`) |
| paint | Presenter | `render-desk.mjs` `render-tree.mjs` |
| key chords | Surface | `keybinds.mjs` `main.mjs:runAction` |

**proven**  Mark 2 Join wrap-pair does **not** call `wrapNodes`; promote-join
does **not** call `promoteChildren` (`mark2.mjs:wrapTwoLeaves` ~L562,
`joinLeafIntoCon` ~L501). Both splice via atomics. Twin of the named
TreeOps.

#### 3. How pure is the kernel?

| Concern | In `tom/`? | Tag |
| --- | --- | --- |
| `gi://` / GObject / Meta / St | **No** | proven (grep empty) |
| `document` / cytoscape / localStorage | **No** (presenters) | proven |
| Keybinds | **No** | proven |
| Child-list policy (wrap vs cross-mon) | **No** in atomics/composed | proven |
| OpSet prefs (`decisions`) | **Yes** on Forest | proven |
| `peelModel` / `mergeTags` | **Yes** on Forest; peel used only in `tree.mjs` | proven |
| Monitor **geometry** | MONITOR `geom` on Node; `paneRect` in sizing | proven |
| Neighbor-head World | **No** — `monitors.mjs` | proven |
| 10% floor | sizing TreeOps | proven |
| Invent-join / max-1 / coerce | OpSet | proven |

Comment at `kernel.mjs` L3–5 (“No tiling policy. No monitor geometry.”) is
**stale** vs `geom` + `decisions`.

#### 4. Unary collapse, breakout=promote, MONITOR max-1, settle

**Breakout = Promote (one node becomes sibling of its parent)** —
**proven** TreeOp `composed.mjs:breakout` ~L89–103. Refuses if parent is
MONITOR/WORKSPACE/ROOT. Does **not** run unary. Mark 2 Move/Join call
`breakoutLeaf` → that TreeOp (`mark2.mjs:breakoutLeaf` ~L639–650).

Mark 2 SurfaceOp **Promote** (`{`) is **not** that TreeOp. It is
`promoteChildren` (dissolve selected CON) plus max-1 refuse
(`mark2.mjs:mark2Promote` ~L249–275). Glossary: breakout/promote of a
*node* vs PromoteChildren of a *CON* — same word family, two symbols.

**Unary collapse** — **proven** TreeOp `composed.mjs:collapseUnary` ~L191–217.
Only `kind === "CON"` with exactly one child. Copies CON `percent` +
`userSized` onto the survivor. MONITOR/WS/ROOT never collapse.
`cleanupStructure` loops prune+unary. Mark 2 settle **also** coerces.

Worked (TreeOp breakout, no settle):

```text
Given:   Mon1(H(V(A,B),C))
Actions: breakout(A, before)     # composed.mjs:breakout
Expect:  Mon1(H(A,V(B),C))
```

Worked (Mark 2 Move then settle — unary deletes V):

```text
Given:   Mon1(H(V(A,B),C))
Actions: Select(A); Move(left)   # breakout then mark2CleanupUnder
Expect:  Mon1(H(A,B,C))
```

(`cases-mark2.mjs:move-breakout-nested-left`; `cases-composed.mjs` keeps
`V(B)` because composed tests do not settle.)

**MONITOR max-1** — **proven** **not** in atomics
(`cases-atomics.mjs:atom-mon-multi-child-allowed`, Given `Mon1(A,B)`).
TreeOp `breakout` **allows** a leaf out of the monitor’s sole child CON
(`cmp-breakout-allows-mon-sole-child-leaf` → `Mon1(H(B),A)`). OpSet
`cannotBreakoutLeaf` refuses when grandparent is MONITOR
(`mark2.mjs` ~L540–553). `mark2Promote` refuses dissolving the monitor’s
only child (~L255–257). `transferLeafToMonitor` wraps/enters so dest
MONITOR stays 0/1 (`monitors.mjs` ~L205–228).

**Settle** — **proven** OpSet `mark2CleanupUnder` ~L167–178 = pruneEmptyCons
+ collapseUnary + coerceSameTypeUnder. `Remove` settles; TreeOp `Delete`
does not (`mark2.md`; `cases-mark2.mjs:delete-atomic-leaves-unary` vs
`remove-collapses-unary`).

#### 5. Sizing: percent, userSized, floaters, floor 10%

**proven** TreeOps, not Mark 2 policy (`README` “Sizing (TreeOps, not Mark
2)”; implementation `sizing.mjs`).

- Default equal floaters (`userSized=false`); leftover after sized kids
  splits equally (`redistributeFloaters`).
- Floor `SIZE_MIN = 0.1`; step `0.05`; presets 75/66.7/50/33.3.
- Leave an H/V → `clearShareOnLeave` (`userSized=false`). Last floater gone
  → rescale sized shares (`repairSharesAfterChildChange` from every atomic
  child-list change).
- Unary still copies the CON’s slot (`collapseUnary` ~L205–209;
  `size-unary-collapse-keeps-con-share`).
- TAB/STACK: size ops target the bag slot (`containingSplit` skips bags).
- Launch 10% **policy** (wrap TAB instead of split) is OpSet, using TreeOps
  predicates `extraFloaterWouldViolate` / `wrapWouldViolateMin`.

Worked (launch floor is OpSet):

```text
Given:   Mon1(H(A,B,C,D,E,F,G,H,I,J))
Actions: Launch()
Expect:  Mon1(H(A,B,C,D,E,F,G,H,I,TAB(J,K)))
```

(`cases-mark2.mjs:launch-end-ten-kids-tab`, `expectMode: wrap-tab`)

#### 6. Import into `lib/tom/` (GJS vs Node)

**proven**  Proto TOM is already gi-free ESM, no `node:` builtins, no DOM.
D036 pattern: product kernel in `lib/shared/`-style **`.js` ESM**; GJS
extension already does `import { Logger } from "../shared/logger.js"`.
Proto uses **`.mjs`** because the Vite/Node package has `"type": "module"`.
GNOME Shell ESM wants `.js`.

Lift shape (recommendation, not done this session):

```text
lib/tom/
  index.js kernel.js atomics.js composed.js queries.js sizing.js api.js
  shorthand.js          # tests/chat only
lib/opset/              # name locked at P0b; not inside presenter
  index.js transact.js mark2.js
```

- **GJS:** `import { createTomApi, appendChild, … } from "../tom/index.js"`
  from `lib/extension/`. No gi in those files.
- **Node tests:** keep `node test/run.mjs` (or point it at `lib/tom`).
  Do not run this suite inside GJS.
- **Do not** import `tree.mjs` / `render-*.mjs` / `keybinds.mjs` into
  `lib/tom/`.
- Glossary file stays
  `prototypes/container-motion/src/opsets/mark2.md` until product adopt
  (D074). Copying a second glossary is forbidden.

**guess**  GJS will swallow the current JSDoc/`@ts-check` surface. Optional
chaining and `Object.values` already exist in Shell ESM.

#### 7. Contamination already in proto

**proven**  Policy object on Forest; Mark 1 `mergeTags`/`peelModel`; MONITOR
`geom` used by TreeOps `paneRect`; World `transferLeafToMonitor` owns max-1
wrap; Join bypasses `wrapNodes`/`promoteChildren`; `createTomApi` selection
facade vs free functions. Full rows: **Weaknesses** and **Twins** below.

#### 8. Shorthand Given/Actions/Expect

**proven**  D073 + `shorthand.mjs` L1–12 + proto README: lingua franca for
chat + tests, **not** a product DSL. One parser; no extra doc.
`buildGiven` materializes via `createTomApi` and **bypasses** atomics for
the initial tree (`childIds` / `parentId` assigned directly ~L287–301) then
equalizes percents. That is fine for fixtures; product restore should use
atomics + `ensureSpine`.

---

### Strengths (keep)

- **proven**  Real split: atomics do not wrap, cross-mon, or coerce. Composed
  breakout does not settle. OpSet settle adds coerce. Tests encode that
  (`cmp-collapse-unary-no-coerce` leaves same-type unfixed;
  `atom-mon-multi-child-allowed`; `cmp-breakout-allows-mon-sole-child-leaf`
  note: “mon-sole-child guard is OpSet policy, not TreeOp”).
- **proven**  `runOpAbstract` clone/commit so presenters paint a committed
  TOM (`transact.mjs`).
- **proven**  Green abstract suite + wrong desk = paint (README FIRM;
  `test/run.mjs` header).
- **proven**  D023 names exist as functions (`appendChild` / `insertBefore` /
  `removeChild` / `replaceChildren`) — the port path, vs Forge GObject
  methods that still own Meta/St.
- **proven**  Unary copies CON slot; leave-split clears `userSized`; 10%
  floor is one module (`sizing.mjs`).
- **proven**  One glossary file (`mark2.md`) + shorthand trees. “Molecule”
  retired (README + D073).
- **proven**  Presenters consume Forest: `render-desk` walks `childIds` +
  `percent`; cytoscape builds elements from the same map. Neither mutates
  topology.

---

### Weaknesses / duck-tape

| Failure class | Symptom in code | Why the abstraction is wrong |
| --- | --- | --- |
| Policy on the document | `Forest.decisions` (`kernel.mjs` ~L34–51, `defaultDecisions`) | TOM must not own `edgeMove` / `peelModel` / `policyEnabled` / `opsetId`. Session/OpSet prefs |
| World on the node | `Node.geom`; `sizing.mjs:paneRect` | Geometry is Host/World. Floor-vs-monitor-px couples TreeOps to display |
| Parallel monitor index | `f.monitors` plus spine `WS.childIds` | Two sources of truth. Clone remaps; a future atomic MONITOR insert would split them |
| Named TreeOps bypassed | `wrapTwoLeaves` / `joinLeafIntoCon` reimplement wrap + dissolve | Next Join bug will patch the local list, not `wrapNodes`/`promoteChildren` |
| World owns max-1 transfer | `monitors.mjs:transferLeafToMonitor` (~L188) | README seam: wrap/enter is Mark 2, not geometry |
| Mark 1 leftovers on Forest | `mergeTags`; `peelModel`; `api.wrap(..., withTagged)` | Kernel still ships a retired Surface |
| Facade ≠ functions | `createTomApi.wrap` / `ungroup` / `flatten` / selection `setLayout` | Second API over TreeOps; tests mix both |
| Presenter clones TomApi methods | `tree.mjs` `focusParent`/`focusChild` duplicate `api.mjs` | Spread `{...tom, ...extra}` then extra redefines them |
| STACKED axis twin | `queries.mjs:parentAxis` → `"v"` for STACKED (~L16); `isInAxis` TAB/STACK = L/R (~L26–27); `tree.mjs:parentAxis` copies the `"v"` version | Focus/swap in presenter can disagree with Mark 2 in-axis |
| Stale kernel banner | “No monitor geometry” vs `geom` on MONITOR | Comment lies; agents will trust it |
| `wrapNodes` param `host` | `composed.mjs:wrapNodes` | Glossary: do not say “host” |
| Proto WS count | always `WS1` | Product has many workspaces; spine factory is a stub |
| Launch policy fork | `main.mjs:launchApp` ~L295: OpSet vs `api.launch` | Two launches; tests only cover Mark 2 |

---

### Twins / bypasses

Claimed catalog: [contracts.md](../../../../docs/dev/contracts.md) “Tree
child list / order” = `Node.appendChild` / `insertBefore` / `removeChild` /
`replaceChildren`. **Do not** assign `childNodes`.

| Job | Named proto API | Hand-rolled / other |
| --- | --- | --- |
| Child list | `atomics.mjs:appendChild` … | Forge `tree.js` GObject methods + still-present `childNodes` setter (later note). Shorthand `buildGiven` writes `childIds` directly (~L287–301) |
| Wrap a pair | `composed.mjs:wrapNodes` | `mark2.mjs:wrapTwoLeaves` |
| Dissolve CON | `composed.mjs:promoteChildren` | `mark2.mjs:joinLeafIntoCon` promote-join (~L517–536: `replaceChildren` + `delete f.nodes[sib.id]`) |
| Promote one node | `composed.mjs:breakout` | SurfaceOp name `Promote` = `promoteChildren` (different). Shorthand `Promote()` maps to OpSet |
| Settle | `composed.mjs:cleanupStructure` vs `mark2CleanupUnder` | Second adds coerce — **intentional**, but callers must not mix |
| Launch | `mark2.mjs:mark2Launch` | `tree.mjs:launch` (policy off / TreeOp) |
| In-axis move | `mark2Move` (swap/wrap/cross/breakout) | `tree.mjs:moveDir` (swap only, fail at edge) |
| Ungroup | `api.mjs:ungroup` → `promoteChildren` | Forge `tree.ungroup` (contracts). Proto `Ungroup()` is TomApi, not Mark 2 |
| Parent axis | `queries.mjs:isInAxis` | `queries.mjs:parentAxis` + `tree.mjs:parentAxis` + `monitors.mjs:dirInParentAxis` |
| Ancestor MONITOR | `queries.mjs:ancestorMonitor` | `monitors.mjs` local `ancestorMonitor` (~L266) |
| focusParent | `api.mjs:focusParent` | `tree.mjs` copy |

Forge still *is* the contracts catalog. Proto is the future named API.
Until lift, two catalogs.

---

### Import recommendation

Whole-kernel + OpSet + HTML presenter, separately (feeds `import-map.md`):

| Piece | Rec | Why |
| --- | --- | --- |
| `tom/{kernel,atomics,composed,queries,sizing,api,index}` | **port** | This *is* the product TOM. Rename `.mjs` → `.js` under `lib/tom/`. Strip `decisions` / `mergeTags` from the kernel type (move to OpSet session) in the same lift or immediately after |
| `tom/shorthand.mjs` | **port** (tests/chat only) | D073 lingua franca. Do not wire to CLI/DBus as a layout language |
| `opsets/mark2.mjs` + `mark2.md` | **port** OpSet / **keep** glossary path until adopt | First control surface. Fix wrap/promote-join to call TreeOps as part of port |
| `opsets/transact.mjs` | **port** | Clone/commit belongs with OpSet (or a tiny `lib/tom/txn.js`) |
| `monitors.mjs` geometry (`neighborMonitor`, `orderedMonitors`) | **reshape** | World/Host. Keep out of `lib/tom/` |
| `monitors.mjs:transferLeafToMonitor` | **reshape** | Split: TreeOps place-on-monitor + Mark 2 max-1 wrap |
| `tree.mjs` presenter extras | **park** then **reshape** | Peel/group/focusDir stay proto until a second OpSet or Forge surface needs them. Do not import peel into the kernel |
| `render-desk.mjs` `render-tree.mjs` `keybinds.mjs` `main.mjs` `storage.mjs` `presets.mjs` | **park** | HTML presenter. Product presenter is Mutter/Meta (later note) |
| Proto `plog.mjs` | **discard** for product | Local ring; Forge dual-tape is `lib/shared/plog-adapter.js` |
| `Forest.decisions` / `mergeTags` / `peelModel` | **reshape** off TOM | Prefs → OpSet/session; peel → presenter or a named SurfaceOp |
| Forge `tree.js` Node | **do not pare in place** | Option 2: new kernel, then import surfaces onto it |

**P1 lift order (planning only):** `lib/tom/*.js` → point proto tests at it →
OpSet module → Forge presenter adapter. Do not start that this session.

---

### Entry points for later agents

- Need the **tree shape** → `kernel.mjs` typedefs + `createForest` /
  `ensureSpine`.
- Need **child-list** → `atomics.mjs` (D023 names). Never assign `childIds`
  except inside those functions (shorthand fixtures excepted).
- Need **breakout / unary / wrap / dissolve** → `composed.mjs`. Unary is
  not a user op.
- Need **shares** → `sizing.mjs`. Floor is `SIZE_MIN`. Leave-split clears
  `userSized`.
- Need **Mark 2 Move/Join/Launch** → `mark2.md` then `mark2.mjs`. Settle is
  `mark2CleanupUnder`, not `cleanupStructure`.
- Need **cross-monitor** → `monitors.mjs` (World) + `mark2Move`/`mark2Join`
  call sites. Do not add neighbor math to `tom/`.
- Need a **test** → Given/Actions/Expect in the right `cases-*.mjs`. New
  desk bug: `opset` if Mark 2; `workflow` if a user job.
- Need to **talk** about a desk → shorthand in `shorthand.mjs`. Not a DSL.
- Need **paint** → `render-desk.mjs`. Wrong pixels, green tests → paint.
- Need **policy-off** desk → `tree.mjs` + `main.mjs` `policyEnabled`.
- Product GJS import pattern → `lib/extension/*.js` importing
  `../shared/*.js` (D036). Mirror that for `lib/tom/`.

---

### Open questions

Only blockers for layer assignment / P0b:

1. **guess**  Does `Forest.decisions` stay a document field (tiny session
   blob) or become `OpSetState` beside the Forest? Kernel purity wants the
   latter.
2. **guess**  MONITOR `geom`: keep on the node for `paneRect`, or a World
   map `id → rect` that sizing queries? Launch 10% needs px.
3. **guess**  Should `f.monitors` die in favor of `children(WS)` so the
   spine is the only list?
4. **proven**  `wrapTwoLeaves` / `joinLeafIntoCon` bypass named TreeOps —
   fix on port, or accept OpSet-local composition? (Canonical APIs say
   extend/call `wrapNodes` / `promoteChildren`.)
5. **guess**  Where does `lib/opset/` live vs `lib/tom/`? Scheme says OpSet
   ≠ TreeOps. Do not bury Mark 2 inside `lib/tom/mark2.js` if that hides
   the line.
6. **guess**  Proto `createTomApi` selection-aware methods: product public
   API, or keep only free functions + a thin binder?
7. **proven**  Proto is single-WS. Product TOM must accept `WORKSPACE*`.
   Factory change only — kinds already exist.
8. **guess**  Peel Model A/B: discard with Mark 1, or a future OpSet? Not
   TreeOps.

---

### Do-not-rescan traps

- **MONITOR max-1 is OpSet**, not atomics. `Mon1(A,B)` is a valid TOM.
  TreeOp breakout of A from `Mon1(H(A,B))` yields `Mon1(H(B),A)`.
- **Breakout TreeOp ≠ SurfaceOp Promote.** Promote (`{`) = dissolve CON
  via `promoteChildren`, refused on mon sole child.
- **Unary is a settle rule**, not `breakout`. Composed tests keep `V(B)`;
  Mark 2 Move does not.
- **`Delete()` / `destroyNode` do not settle; `Remove()` does.**
- **`Forest.decisions` is OpSet prefs on the TOM.** `peelModel` is unused
  by Mark 2 (presenter peel only).
- **`f.monitors` is not the spine walk.** `cloneForest` rewires it.
- **`percent` defaults to `1`** in `makeNode`; parents equalize later.
- **`parentAxis` (STACKED = v) ≠ `isInAxis` (TAB/STACK = L/R).** Mark 2
  uses `isInAxis`.
- **Join wrap/promote-join do not call `wrapNodes` / `promoteChildren`.**
- **Harness Swap/Focus/Group need `TreeApi`; tests use `createTomApi`.**
- **Sizing cases are tagged `atomics`/`opset`**, not a `npm run test:sizing`
  script (`package.json` only atomics/composed/mark2/workflows).
- **GJS wants `lib/tom/*.js`, not `.mjs`.** Proto package is `.mjs` for
  Node/Vite.
- **Shorthand `buildGiven` writes `childIds` by hand** — fixture only.
- **Do not invent a second glossary.** Words live in `mark2.md`.
- **“Molecule” is retired.** Do not revive it for TreeOps or SurfaceOps.
- **Green tests + ugly desk = paint**, not a TOM patch.
)
