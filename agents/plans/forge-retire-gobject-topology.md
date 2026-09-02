# forge-retire-gobject-topology — Delete GObject Node/Tree as topology

**Status:** accepted — **sole active topology P0**; **D100 lock**
(2026-09-01) supersedes executing the old Meta-handler catalog
**Branch:** master
**Lock:** **D096–D100** — Meta = reality; TOM Forest = belief/intent;
thin ForgeAdapterGnome; signal default no-op; title = chrome; **old
handlers disconnected**. GObject `Node`/`Tree` child-lists remain
**forbidden** as tiling topology.
**Supersedes / archives:**
[forge-live-tom-cutover](./archived/completed/forge-live-tom-cutover.md)
(C7 leftover) ·
[forge-tom-agree-resync](./archived/completed/forge-tom-agree-resync.md)
(R6 residue) ·
[forge-mark2-one-tiles-path](./archived/completed/forge-mark2-one-tiles-path.md)
(leftover `tree.*`) ·
[architecture-verdict-2026-08-29](./archived/completed/forge-live-layout-dnd-proof/architecture-verdict-2026-08-29.md)
(dual child-list action) · parks
[forge-live-layout-dnd-proof](./archived/completed/forge-live-layout-dnd-proof.md) vinyl
verify until after G1
**Depends on:** D092 · D093 · D095 (locks stand; this plan deletes residue)
**Blocker:** (none) — do **not** invent twin `AtomicsGnome`
**Updated:** 2026-09-02 — **G8n** production adapter stopped `new Tree`
(`createLiveTree` LiveHandle ROOT). `class Tree`/`Node` remain for
tests + API mixin. Host: do **not** `layout dev` until nest chrome
green on this tip.
**Priority:** P0 topology — D100a+D100b+D100c done; **G8n in progress**
(next: stub `tree.js` / peel Tree API off the class; G8l after)

## Goal

Completely **eliminate GObject topology**. End state:

1. **Reality** = Meta/Mutter (existence, monitor, workspace, frame, float).
2. **Belief/intent** = one POJO **TOM Forest** (mutate freely).
3. **Present** = host verbs + St chrome keyed by Forest **nanoid** bags —
   never a second child-list.
4. **Observe → AGREE or RESYNC** (TOM toward reality; FLOAT terminator).
5. **Zero** production use of GObject `Node`/`Tree` as parent/child topology
   (`this.tree` / `wm.tree` / `createNode` / `parentNode`/`childNodes` walks
   for membership). Delete or gut `lib/extension/tree.js` classes.
6. **Chrome Z:** a window’s border is inseparable from that window in Z
   (nothing — including untracked Meta windows — may draw between them).
   TABBED/STACKED strips sit as close as possible in Z to the visible
   app(s) they chrome.

Open/map loop (FIRM):

```text
Meta maps → observe reality → admit into TOM at Meta’s place
  → decide TOM moves (bind PH, split, reparent, …)
  → present host verbs
  → observe within ε → AGREE else heal/RESYNC
```

## Do I agree that “no `tree.` references” is the end product?

**Yes, for the GObject Tree API** — with precise exclusions so we do not
rename the product CLI or English vocabulary into a churn trap:

| Must go | May remain (different meaning) |
| --- | --- |
| `this.tree` / `wm.tree` / `ext.tree` | CLI command **`forge tree`** (dump; source = Forest) |
| `new Tree(...)` / `class Node extends GObject` as topology | Docs “tiling tree” / Mark 2 prose |
| `parentNode` / `childNodes` / `appendChild` on tiling Nodes | Clutter/St `get_parent` / `insert_child_above` on **actors** |
| `tree.createNode` / `tree.render` as structure authority | Pure present helpers renamed off `Tree` (e.g. `presentSlots`) |
| GetTree walking GObject monitors | DBus **GetTree** method name; body = Forest+bag projection |

Acceptance grep (production `lib/extension`, excluding comments that say
“retired”): **zero** matches for `wm.tree`, `this.tree`, `new Tree`,
`createNode(`, and tiling `parentNode`/`childNodes` membership. Tests
retargeted the same way.

## Non-goals

- Pinned-slots / resize-autotile / Forest reshape-for-its-own-sake
- Porting belt / Mode B / title→`renderTree` / entered-monitor maze
  into the new adapter
- Preserving GetTree JSON as a second TOM language
- Dual-run forever / BC shims for Meta-on-node
- Leaving `WindowManager` / `window.js` as a façade (D098: **delete**)

## Why C7 was not enough

Cutover C0–C7 made **writers** Forest-first and marked “GObject no longer
authority” while leaving:

| Residue | Evidence |
| --- | --- |
| Open still `tree.createNode` then `forestInsertWindow` | `window.js` map path |
| Present still `tree.render` → `processNode` → `apply` | `commitLayout` / `renderTree` |
| ~~`paintLiveForest` mirrors Forest onto GObject `replaceChildren`~~ | **G8e done** — chrome uses `liveChildrenForPresent` |
| Chrome on `Node.decoration` / `Node.tab` | `tree.js` `_createDecoration` |
| Borders in `window_group` via Node | `window.js` + `decoration.js` |
| GetTree Surface = GObject walk | `tree-query.js` |
| DnD/RunSteps `ids-miss` → GObject fallback | `drag-drop.js` |
| ~150 `this.tree` in `window.js`; ~190 `parentNode`/`childNodes` in `tree.js` | ripgrep 2026-08-31 |

That dual child-list **is** the vinyl PH / Meta-mon mismatch class.

## Architecture target

```text
Meta map / host event
        │
        ▼
   observe(reality)          facts: exist, mon, ws, frame, float, mins
        │
        ▼
   admit / RESYNC TOM        Forest atomics + RuleSet toward reality
        │
        ▼
   Mark 2 / layout intent    mutate Forest only
        │
        ▼
   present(forest, bags)     Meta verbs + St chrome by nanoid
        │
        ▼
   observe → AGREE?          ε geometry (D095); else heal loop
```

**Bags:** `hostBag: Map<nanoid, { meta?, actor?, border?, tabStrip?, … }>`.
No Meta on Forest nodes. No St ownership on a GObject tiling Node.

## Chrome Z (acceptance — product)

### Window border

- Each tiled (and product-float-border) window has a border actor that is
  **always** immediately above that window’s compositor actor in
  `window_group` (or equivalent pairing).
- **Invariant:** no other window actor (tracked **or untracked**) may sit
  between a window and its border.
- On any raise/restack of the window (focus, map, overview exit), restack
  border with it in the same turn.
- Untracked Meta maps must not leave foreign borders covering them;
  border ownership is per-window, never “slot without Meta.”

### TABBED / STACKED strip

- Strip Z is **as close as possible** to the visible app(s) in the group
  (not merely “somewhere above all of `window_group`” if that allows
  unrelated content between strip and app).
- Prefer: strip stacked with the group’s window actors (or a per-mon /
  per-group chrome host that still forbids unrelated windows between
  strip and those apps).
- Keep pickability (R032) and covering-max/fs/zoom hide contracts.
- Focus order remains raise **window first**, then decoration (R032) —
  without burying the strip under foreign windows.

### Explicit non-goal for chrome

- Do not paint borders from stale Forest slots when Meta frame is the
  only reality (R031 class). Border rect for FLOAT = Meta frame; for
  TILE = presented slot only after AGREE (or Meta frame while DRIFT).

## Implementation slices

Do in order. Each slice: failing oracle → patch → L0 → nest smoke when
Shell-touching → update this plan status. **Do not** leave
`ids-miss → GObject` crutches when a slice claims done.

| Slice | What | Exit |
| --- | --- | --- |
| **G0** | Design lock D096 in `design.md` + CHANGELOG; SoT glossary (reality vs belief); chrome Z invariants; this plan = spine | Docs + PRIORITY point here |
| **G1** ✅ | **Open/map/PlaceNext dual-write freeze:** invent WINDOW in Forest + bag only; no `createNode` as topology; PH is Forest+bag stub; present after admit; ε check Meta mon/ws | Zero map-path `createNode` for TILES; nest open + vinyl WS2 — **nest done**; host vinyl eyes remain |
| **G2** ✅ | **Present without structural GObject:** `tree.render`/`cleanTree` must not mutate tiling membership; slot rects from presenter/`paneRect`; `commitLayout` → Forest present | No `cleanTree` flatten; metric if GObject structure changes — **nest done** |
| **G3** ✅ unit | **Spine Forest-first:** WS/MONITOR invent in Forest; bag registers live handles; delete spine `createNode` authority | `workspace.js` / `monitor.js` Forest-first — **unit/proto done**; **nest not signed off** (host-desk incident) |
| **G4** ✅ unit | **Delete GObject fallbacks:** DnD/RunSteps/command `ids-miss` and `tree.move`/`swapPairs` + `syncForestFromTree` gone; hunt `recordFallback` = 0 on nest matrix | Grep clean for syncForestFromTree callers — **unit/proto done**; **nest deferred** (host incident) |
| **G5** ✅ unit | **Chrome peel:** `Node.decoration`/`Node.tab`/border → `hostBag` by nanoid; DecrationsManager id-keyed; chrome Z (G0) — **G5a–G5d done** (bag border+strip; `restackBorderForMeta` same-turn; D046 strip tighten); WINDOW `Node.tab` chips optional leftover | Borders inseparable; tab Z as close as D046; R031/R032/R045 nest |
| **G6** ✅ unit | **GetTree / `forge tree` from Forest+bag** (`projectForestFromTom`); keep method/CLI names | GetTree no GObject child walk — **unit/proto done**; nest not required for dump path |
| **G7** ✅ unit | **Restore/H1/epochs:** delete unseeded GObject restore; always seed Forest; session rehome + H1 mon-loss Forest-only | No GObject restore path — **unit/proto done**; nest not required for restore path alone |
| **G8** | **Delete `class Node` / `class Tree`:** multi-session (G8a–G8n); gut `tree.js`; retarget tests/fixtures; rename leftover present helpers; acceptance greps green | `tree.js` gone or non-topology stub ≤ thin constants file — **G8a+G8b ✅** |
| **R048** ✅ | **Apply bind Forest parent.** `_bindOp` uses `liveParentForPresent` / `tomParent` (not GObject `parentNode`). Seeded path: `forestBindWindow` only. `_findLayoutPlaceholder` includes `liveById` Forest PHs. Dest mon from Forest MONITOR ancestor. FLOATS→TILES bind clears `bag.floating` + TILE mode. | Bind consumes Forest PH when GObject parent is null; L0 green; leftover `forge-ph` gone after bind |
| **G8o** | Remaining apply/session-api **membership parent** via Forest. Thin cosmetics remain (deco/command/DnD previousParent). **Parked** behind D100b — not next. | Seeded layout/order after bind do not abort `window has no parent container` |
| **R050** ✅ unit | **Chrome/overlays Forest-first.** | Hunt `groups=` = Forest TABBED count — **L0 green**; nest/host pending |
| **R049** ✅ unit | **mon1.s0 Voice not in TABBED.** | Forest parent of 3rd tab = slot TABBED — **L0 green**; nest/host pending |
| **D100a** ✅ | **Disconnect old-architecture Meta handlers.** Observe/log (`metric d100-observe`). Title → chrome label only (D099). Keep map/admit, destroy, grab, workspace spine, settings, overview, PlaceNext identity. | Idle entered-monitor / size / title / class / ws-follow / fullscreen do not `renderTree` or restore-to-slot — **this slice** |
| **D100b** ✅ extract | **Thin ForgeAdapterGnome core** in named modules. Map → admit → present → ε. Handler **may depend on** Mark 2 RuleSet, **is not** Mark 2 OpSet. | Modules land; `smoke-nest-apps` PASS; hunt agree/resync/present + `d100-observe` |
| **D100b** ✅ residual | **Late identity FLOAT→TILE** without maze reconnect. `onLateIdentity` in `adapter-map-admit.js`; wm-class / title empty↔nonempty → `_applyProcessFloatDecision` (no `fromPresent`) + `commitLayout(*-identity)`. Re-assert TILE after adopt slotSplit (paintFloatModeBridge clobber). | L0 `bug-d100b-late-identity-tile`; D100 disconnect green; nest `smoke-mark2` PASS (2× TILE + join.right); `smoke-nest-apps` PASS |
| **D100c** ✅ | **Delete `window.js` / `class WindowManager`.** Spies import ForgeAdapterGnome. No re-export tumor. Micro-slices: **c0** ✅ modes → **c1** ✅ open-place → **c2** ✅ present-idle → **c3** ✅ float → **c4** ✅ destroy → **c5** ✅ window-signals → **c6** ✅ grab-resize → **c7** ✅ settings → **c8** ✅ lifecycle → **c9** ✅ promote `ForgeAdapterGnome` + delete file. H1/session **park**. | File gone; tests import adapter |
| **G8n** | `tree.js` gone or stub; full Node list gut | After D100c + desk holds **without** old handlers — **partial** (adapter `new Tree` stopped; `createLiveTree`; classes remain for tests + mixin) |
| **G9** | **Delete STACKED** (no BC). TABBED remains. | After overlays + D100b |
| **G10** | Policy/options in **session/host bags** | Opportunistic |

**Parallelism:** G0 first. G1 ∥ early G5 design spike. G2 after G1.
G3 after G1. G4 after G1–G3. G5 can start after G2 (needs present).
G6 anytime after Forest dump is honest. G7 after G3. G8 last.
**D100a+D100b+D100c done + nest confirm.** **G8n in progress** (test
membership retarget done; delete/stub classes still open). Do not
port live-bug handlers. G8o / G9 parked.

## Test / verify

| Gate | When |
| --- | --- |
| Proto brake `cd prototypes/container-motion && npm test` | Every slice |
| L0 vitest for touched modules | Every slice |
| Nest: `smoke-layout-dnd`, `smoke-layout-occupied`, `smoke-toggle-tab`, open PlaceNext | After G1, G4, G5 |
| Host eyes: `1:dev` → `2:vinyl`; `forge tree` Forest-backed; no `forge-ph` leftover; borders track Meta | After G1+G5 |
| Acceptance greps (G8) | End |

## Hunt tokens

Add/keep greppable lines (forge log only):

- `metric present` / `metric observe` / `metric agree` / `metric drift` / `metric resync`
- `metric chrome-z` (border restack; strip pair)
- `gobject-topology-forbidden` assert in `--dev` if any child-list mutate slips
- `metric d100-observe` (disconnected old handler fired)
- `live-handle invent kind=WINDOW|CON|WORKSPACE|MONITOR` (once per invent)

## Risks

| Risk | Mitigation |
| --- | --- |
| Tab pickability regress (R032) | Nest `smoke-toggle-tab` + tab-click live; raise order tests |
| Wayland SEGV on early Meta move (R036) | Keep idle Meta moves; observe-first |
| Large `window.js` blast | Slice G1/G5 with extract modules; no drive-by refactors |
| Token budget | One slice per session when possible; nest before host |

## Context for the next agent

- **Operator lock D100:** design supersedes the old handler catalog.
  Meta = reality; TOM = belief; thin adapter; signal default no-op;
  title = chrome label (+ later one size pass). **Delete** `window.js`
  (no façade).
- **D100a done:** idle entered-monitor / size / title / class /
  workspace-follow / fullscreen / raise-float `renderTree` disconnected.
  Hunt: `metric d100-observe`. Title paints `Node.render()` label only.
- **D100b done** (extract + late-identity residual). Nest:
  `smoke-nest-apps` + `smoke-mark2` PASS. Handlers stay observe-only.
- **D100c done + nest confirm:** `forge-adapter-gnome.js` exports
  `ForgeAdapterGnome`; `window.js` / `WindowManager` gone; spies import
  adapter barrel. Tip `--dev`; `smoke-nest-apps` + `smoke-mark2` PASS.
  No façade rename.
- **Next:** **G8n stub** — peel Tree API off `class Tree` (methods
  already mixed onto `createLiveTree` ROOT). Then G8l (`zero this.tree`).
  Live invent is `makeLiveHandle`. Test membership SoT is
  `parentOf`/`kidsOf` / `liveParentForPresent` /
  `liveChildrenForPresent`. **Not next:** invent-lock / H1 / detach
  wash, G8o cosmetics, G9 STACKED, host DnD / cross-mon Ctrl+hjkl
  reconnect, nest GUI. Do **not** reconnect the maze / belt / Mode B.
  Do **not** dual-write Forest + GObject lists.
- **FIRM nest:** only `./scripts/forge/forge-test nested smoke-*` /
  `nested run|exec`. Hunt: `forge-test nested log --grep PAT --level
  info+ --last 40`. **Do not** host `forge layout`.
- **Do not** resave loadouts. **Push** only when human asks.

### G8n live-handle inventory (2026-09-01)

Input for replacing production `new Node` in `tom-live.js` with a
**thin duck LiveHandle** (not a second Node class). Do **not** dump
Node methods onto the duck. Do **not** stop `new Tree` this slice.

**Production invent (this slice):**

| Site | Kind | After invent |
| --- | --- | --- |
| `forestAdmitWorkspace` | WORKSPACE | `actorBin` St.Bin → `window_group`; `hostBag.actor`; **also** `treeRoot.appendChild(live)` |
| `forestAdmitMonitor` | MONITOR | same; **also** `wsLive.appendChild(live)` |
| `forestAdmitMetaWindow` (refresh + new) | WINDOW | `hostBag.meta/windowId/floating`; ctor tab |
| `ensureLiveCon` | CON | reuse `hostBag.actor` or `hooks.createCon()` |
| `liveForestPaintHooks.createCon` | CON | `new Node(CON, St.Bin)` + `con.settings` |
| `forestBindPlaceholderLive` | WINDOW PH | stub Meta; `placeholder`; bag `placeholder: true` |

`lib/extension/tree.js` `new Node` in `createNode` / `split` / `group` /
`createPlaceholderLeaf` / snapshot `createCon` = fixture/unseeded
residue — **not** this invent path.

`ForgeAdapterGnome` `new Tree` (~391 ctor, ~1121 lazy getter) =
**out of duck scope**. Tree still uniquely owns: `settings`,
`findNode`/`getNodeBy*`, `pruneDeadWindows`, `render(from)` delegate,
`attachNode`, `focusUnit`, `monitorManager`, `workspaceManager`, ROOT
`St.Bin` in `window_group`. `rebuildLiveById` maps Forest ROOT → that
Tree instance (`liveById.get("ROOT")`).

Membership SoT (already): Forest `parentId`/`childIds`. Production
reads: `liveParentForPresent` / `liveChildrenForPresent`
(`lib/extension/tom-live.js`). Tests:
`tests/mocks/helpers/treeHelpers.js` `parentOf`/`kidsOf`.

#### Helper reads (A fields only)

| Helper | Reads on the handle |
| --- | --- |
| `liveKind` | `isWindow`/`isCon`/`isMonitor`/`isWorkspace`/`isRoot` if functions, else `nodeType` or `kind` |
| `liveChildrenForPresent` | seeded: `forestIdFromLive` then `liveById.get(childId)`; **fallback** `childNodes` |
| `liveParentForPresent` | seeded: `forestIdFromLive` + `tomParent` + `liveById`; **fallback** `parentNode` |
| `liveBagId` | `forestIdFromLive` then identity scan of `liveById` |
| `forestIdFromLive` | WINDOW → `forestWindowId` (`nodeValue` Meta + bag); spine → string `nodeValue`; CON → `nodeValue` actor vs `hostBag.actor` |
| `liveTilesParented` | **`parentNode`** via `liveKind` — C leak; should be Forest parent kind |

#### Bucket A — Identity (LiveHandle may own)

Thin fields + predicates. Production symbols (not every line):

| Field / predicate | Who |
| --- | --- |
| `nodeType` / `nodeValue` | `tom-live` (`forestIdFromLive`, `defaultWindowIdOf`, `liveFromActor`, `forestEnsureSpineNode`); `layout-placeholder` (`isPlaceholderNode`); `forest-apply-snapshot`; `action-pipeline`; `adapter-open-place`; `forest-run`; `drop-intent`; `tree-layout.minSizeInOrientation`; `liveWindowFromActor` |
| `mode` + `isFloat`/`isTile`/`isGrabTile` | `isUnmanagedWindow`; `paintFloatModeBridge`; `observe-reality`; `adapter-map-admit`; `adapter-float`; `adapter-grab-resize`; `adapter-open-place`; `command.js`; `forest-run`; `forge-adapter-gnome`; `layout-verify`; `present-chrome.getTiledChildren`; `drag-drop` |
| `percent` / `userSized` | `paintLiveForest` writes from Forest; `tree-layout.computeSizes` reads `percent` |
| `layout` + `isTabbed`/`isStacked`/`isStackedOrTabbed`/`isHSplit`/`isVSplit` | `writeLayout` / `paintLiveForest`; `present-chrome.processNode`; `drag-drop`; `command.js`; `decoration.js` |
| `lastTabFocus` (Meta, not Forest id) | `paintLiveForest` (from `tom.lastTabFocusId`); `liveTabOpenLeafForPresent`; `presentWmSlots` buried-vs-open; `session-layout` |
| `actorBin` | `forestAdmitWorkspace`/`Monitor`; bag `actor`; `workspace.js` unparent bin |
| `settings` | copied from `wm.tree.settings` at invent; Node `float` setter (Meta `make_above`) — duck can hold pointer; do not copy setter |
| `placeholder` / `layoutSlot` / `layoutRole` | `forestBindPlaceholderLive`; `layout-placeholder`; `forest-apply-snapshot` |
| `app` | WINDOW ctor `_initMetaWindow`; `node-chrome.getTitle` / `createWindowTab` / `refreshApp` |
| `zoomMode` / `renderRect` | present slot paint (`presentWmSlots`); FLOAT bridge nulls `renderRect` |

**Minimum duck** (fields + predicates — **no** Node methods):

```text
nodeType, nodeValue, mode, percent, userSized, layout,
lastTabFocus, actorBin, settings, placeholder,
placeholderReason?, layoutSlot?, layoutRole?, app?

isWindow isCon isMonitor isWorkspace isRoot
isFloat isTile isGrabTile
isTabbed isStacked isStackedOrTabbed
isPlaceholder
```

`isHSplit`/`isVSplit` = `layout` checks; add if drag-drop still calls
them on the duck. `writeLayout` already falls back to `live.layout =`.
`paintFloatModeBridge` already falls back to `live.mode = "FLOAT"`.
Do **not** port `float` setter, `setLayout`, `render`,
`_createDecoration`, `_resolveExtWm`, `getNodeBy*`, or list mutators.

#### Bucket B — Chrome (hostBag + node-chrome / present-chrome)

**Not** LiveHandle. Dual-write leftovers still sit on the GObject Node:

| Symbol | File |
| --- | --- |
| `createWindowTab` / `ensureConTab` / `destroyTab` / `resetTabForReparent` / `createDecoration` / `releaseDecorationActor` / `destroyDecoration` / `render` / `getTitle` / `refreshApp` / `bagTabOf` | `node-chrome.js` |
| `processNode` / `getTiledChildren` / `ensureDecoration` / `applyDecorationRect` / `ensureTabRowHosts` | `present-chrome.js` |
| `_decorationForCon` / `tabForNode` / `restackBorderForMeta` | `decoration.js` |
| `paintTitleChromeLabel` → `node.render()` | `adapter-window-signals.js` |
| `live.decoration` copy into bag | `ensureLiveCon` |
| `live._destroyDecoration()` | `paintLiveForest` orphan CON sweep |
| `child._createWindowTab` / `_ensureConTab` | `present-chrome` TABBED/STACKED |
| `node.tab` / `node.decoration` / `node._tabRowHosts` / `node.windowActor` / `node.actor` / `node.rect` | Node + deco + layout-debug |

**Ctor vs later chrome (Q2):** WINDOW ctor (`tree.js` ~181–199) calls
`_initMetaWindow` + `_createWindowTab` unless PH. CON ctor (~202–204)
calls `_createDecoration`. Both are **eager**:
`NodeChrome.createWindowTab` / `createDecoration` write `node.tab` /
`node.decoration` **and** `hostBag`. Present already recreates if
missing (`ensureDecoration`, TABBED/STACKED `_createWindowTab`).
**Nest chrome does not require ctor** if invent + first present always
run `NodeChrome.create*` with `(wm, live)` and bag id. Skip ctor when
the duck lands; call chrome helpers after `liveById.set` (WINDOW tab
only if not PH; CON deco so `ensureLiveCon` bag copy still works, or
move that copy into `createDecoration`).

Tab click still closes over `node._activateFromTab` /
`node._armTabDragForWindow` / `node._resolveExtWm` (parent walk to
Tree). Keep those in `node-chrome` taking `wm`, not on the duck.
`ensureConTab` / `getTitle` still use `node.getNodeByType(WINDOW)` —
retarget to Forest kids + `liveById` (C, not a duck method).

#### Bucket C — Topology (Forest only)

Forbidden as tiling membership. Production still **touches** GObject
lists on live handles:

| Symbol | File / why |
| --- | --- |
| `parentNode` / `childNodes` | fallback in `liveParentForPresent` / `liveChildrenForPresent` / `childrenOf`; `liveTilesParented`; many `\|\| node.parentNode` sites (`adapter-open-place`, `drag-drop`, `session-api`, `forge-adapter-gnome`, `layout-placeholder`, `open-min-place`, `drop-intent`) |
| `appendChild` / `removeChild` | `forestAdmitWorkspace`/`Monitor` spine; `paintLiveForest` FLOAT detach + orphan CON; `adapter-open-place` unseeded insert |
| `nextSibling` / `insertBefore` | `adapter-open-place` unseeded order |
| `contains` / `getNodeByType` | `liveTabOpenLeafForPresent`; `node-chrome.ensureConTab`; `open-min-place`; `drag-drop` CON settle |
| `resolveRetileParent` | walks `liveNode.parentNode` vs `liveById` |

G8j `blockSeededTilesListMutate` **allows** ROOT←WS, WS←MON, FLOAT
park, `_presentPaintMirror` paint cleanup. That is leftover dual-write,
not a reason to keep lists on the duck.

**Q3 FLOAT detach** (`paintLiveForest` ~1746–1753:
`parentNode.removeChild`): Forest FLOATS is already membership SoT.
WINDOW `removeChild` does **not** tear tab chrome (that is `removeNode`).
Once the duck has no lists, this call is a no-op — **delete it**. Keep
`paintFloatModeBridge` (mode + clear `renderRect`) + `hostBag.floating`.
Strip unparent of a FLOAT tab is present-chrome (Forest kids omit
FLOAT). No extra GObject detach hook.

Orphan CON sweep (~1780–1801) is the same class: Forest already dropped
the CON. Keep **chrome** `destroyDecoration(wm, live)`; drop
`appendChild` extras / `removeChild` live.

**Q4 spine `treeRoot.appendChild(live)`:** **GObject topology
dual-write**, not St parenting. St is `parentSpineBin` →
`window_group.add_child(actorBin)` (and Tree ctor adds ROOT bin).
G8j allow-list exists so spine attach still mutates Node lists.
**Drop `appendChild` when inventing the duck**; keep `parentSpineBin`.
`forestEnsureSpineNode` still reads `live.parentNode` for MONITOR’s
WORKSPACE — use Forest `parentId` / `liveById.get(wsId)` instead.

#### Bucket D — Tree-only (stay on `class Tree` this slice)

`ForgeAdapterGnome` `new Tree`; managers constructed with `this._tree`.
Do not move onto LiveHandle:

- `settings` **source** (duck may copy a pointer)
- `findNode` / `getNodeByValue` / `getNodeByType` / `getNodeByLayout`
  (some already prefer `liveWindowFromMeta`)
- `pruneDeadWindows` (`adapter-present-idle`)
- `render(from)` unseeded path
- `attachNode` / `focusUnit`
- `monitorManager` / `workspaceManager`
- ROOT `St.Bin` + `_initWorkspaces`
- `createNode` (invent lock)

#### Must stay GObject `Node` this slice

- Tests invent-lock (`Node.test`, Tree G8a/j list mutators)
- `Tree.createNode` / `split` / `group` / `createPlaceholderLeaf` /
  snapshot `createCon` (unseeded + `_allowGObjectCreateNode`)
- Unseeded `liveChildrenForPresent` GObject fallback
- `class Tree` itself (adapter `new Tree`) — **not** this duck slice

**Next production step:** `makeLiveHandle(kind, value)` in `tom-live`
(or tiny sibling); replace six `new Node` invents; stop
`import { Node } from tree.js` there; chrome via `NodeChrome.*` after
register. Do **not** dual-write lists “to keep tests green.”

## Session note

2026-09-02 — **G8n L0 related retarget (test-only).** Husky `vitest related`
on tip `8f1a8347` was ~63 files / 274 tests red. Four worktree batches
retargeted regressions + unit suites to Forest `parentOf`/`kidsOf` +
`seedLiveForest` after invent. Helpers: `wrapCreateNodeForestReseed` /
`createWindowManagerFixture({ reseedOnCreateNode })` (session-layout opts
out). Merged failed-set **63/63** green (841 pass / 9 skip; H1 structural
cases parked). **No** Forest←GObject dual-write. **Next:** host R054/R055
verify; then G8n stub peel `tree.js`.

2026-09-02 — **G8n adapter stop `new Tree`.** Production
`ForgeAdapterGnome` ctor + lazy `tree` getter use `createLiveTree(wm)`
(LiveHandle ROOT + `ensureLiveListMutators` + Tree/Node API mixin +
MonitorManager/WorkspaceManager + `_initWorkspaces`). Zero production
`new Tree` (comments only). `this.tree` remains (G8l). `minimizedWindow`
reads `nodeType`/`nodeValue`. `MonitorManager.getMonitorNode` prefers
`liveById`. live-compat: `setLayout`, sibling/`index`/`actor`, Forest
`getNodeByType` also walks leftover list kids. Tests: LiveHandle ROOT
contract on adapter fixture; `createWindowNode` Forest-inserts when
ROOT is a duck. **Leftover:** `class Tree`/`Node` in `tree.js` (~3.4k)
for tests + mixin; GObject `new Tree` fixtures still invent-lock;
Tree-cleanup G2 spies vs leftover `Tree.render`+`cleanTree`; some
Tree-operations/prune-dead `kidsOf` vs createNode (Forest empty SoT).
Proto 154. Named L0: adapter lifecycle/workspace/layout/batch-float +
Tree/Node/Tree-layout/Monitor/Workspace/tom-live/live-handle + d100 +
r051 green. Nest not run. Do **not** dual-write. Do **not** host
`layout`. **Next G8n:** stub/peel `tree.js` methods off the class.

2026-09-02 — **R051 chrome-lifetime on present (not G8n continue).**
Wayland `forge layout dev` SIGSEGV: `applyDecorationRect` `add_child`
on C-disposed St.BoxLayout. Fix: `actorAlive` / never St-call
`_forgeDisposed`; `createWindowTab`/`ensureConTab` drop dead chips and
recreate; processNode strip/hide catch uses `destroyDecoration` (tabs
first); same-pass ensureDecoration + tab rebuild. Guard:
`bug-r051-present-chrome-disposed-st`. Hunt: `metric warn deco-disposed`.
Do **not** host `forge layout` / nest / `./install` from this slice —
orchestrator installs after review. Host still `disable-user-extensions`.
**Not** G8n (`new Tree` stub). Classes remain.

2026-09-01 — **G8n membership retarget (tests) done.** Tests/helpers
only; no production. Slot math ≠ topology: Tree-layout + 5qp1 pass
explicit `tiledChildren` (no `childNodes =`). Membership expects use
shared `parentOf`/`kidsOf` only. Local twins deleted: open-app-policy
`parentOf`/`kidsOf`, CommandHandler live-tree `kids()`, tab-strip
direct `liveChildrenForPresent` in tests. Combined named L0 **716
pass / 3 fail** (pre-existing G2 ×2 + R032 raise). Proto 154. Nest
not run. Classes still required.

**Architecture note (do not dual-write):**
`ensureForestSpineReady` sets `_liveForestSeeded` without WINDOW
nodes. G8j then fail-closes GObject `appendChild`; `forestReparent`
misses invent-via-`createNode` windows. Reads already gate on
`forestHasWindow`. Tests that GObject-invent after spine-ready must
`seedLiveForest` (insert-flatten, r031). Product map = `forestAdmit`.
Do **not** restore GObject TILES fallback.

**Skip remaining test `parentNode`:** invent-lock (`Node.test`, Tree
G8a/j); GObject-detach after `removeChild`; H1/session/epochs restore;
mock ducks (CommandHandler, WorkspaceManager, `epochs/pojo.js`);
parent-walk guards (`nmdo`, `zyx3`, `t1s9`, `ipga`).

**Next G8n:** stop adapter `new Tree` (`ForgeAdapterGnome`), then stub
`tree.js`. Production `tom-live` invent is already `makeLiveHandle`.

2026-09-01 — **G8n hot-suite retarget + chrome peel.** Membership SoT
is `parentOf`/`kidsOf` on `WindowManager-drag-drop` (+ comprehensive),
`WindowManager-commands`, `WindowManager-insert-slot-split` (local
twins deleted), `Tree-operations`, `Tree.test`, `ungroup-i2`. Invent-lock
GObject-list tests in `Tree.test.js` kept. `node-chrome.js` owns St
tab/decoration lifecycle; PresentChrome owns `measureMinTabWidth`;
Node/Tree keep thin wrappers. `liveBagId` moved to `tom-live.js` (G8j
detach + bag chrome). Tab sibling restyle / `destroyDecoration` kids
via `liveChildrenForPresent`. `tree.js` 3865 → 3417. Proto 154; named
L0 415 green; R032 tab-click raise-on-Done **pre-existing**. Nest
`smoke-mark2` PASS (2× TILE + join.right VSPLIT). **Next G8n:**
Tree-layout / remaining regression membership expects, then stub when
`tom-live` stops `new Node` and adapter stops `new Tree`.

2026-09-01 — **G8n fixture retarget micro.** `treeHelpers.js`:
`parentOf`/`kidsOf` (Forest-aware; GObject fallback); invent helpers
reseed **only** when `_liveForestSeeded` (no unseeded dual-write —
Tree G8a/j safe). Pilot `move-focus-parent-c4.test.js` uses helpers +
`seedLiveForest` (reseed after Host/helper moveIn/Out). Enums from
`tree-types.js`. Barrel already `export *`. L0 acceptance 258 green;
proto 154. Nest not re-run. **Next G8n:** retarget more hot suites /
fixtures, then stub classes.

2026-09-01 — **G8n Queue peel.** `lib/extension/queue.js` plain FIFO
(no GObject). `tree.js` breadth-walk + `ForgeAdapterGnome` +
`Queue.test.js` retargeted; `tree.js` ~3865. Proto 154; Queue /
Tree-layout / Tree / Node / Tree-operations green. Nest `smoke-mark2`
PASS (2× TILE + join.right → VSPLIT). **Next G8n:** fixture retarget
off GObject `childNodes` SoT, then stub classes.

2026-09-01 — **G8n processNode peel.** Tree chrome/present methods are
thin `PresentChrome.*` delegates (~386 lines deleted from `tree.js`;
now ~3890). `measureMinTabWidth` stays on Tree. Proto 154; Tree-layout /
Tree / Node / Tree-operations green. Nest `smoke-mark2` PASS. **Next
G8n:** peel `Queue`, fixture retarget, then stub classes.

2026-09-01 — **G8n partial.** Tip had **no** G8a invent lock / G8j
`blockSeededTilesListMutate` / G8k Forest-first `Tree.split` (docs+tests
only). Re-landed in `tree.js`; enums re-export `tree-types.js`;
production enum imports retargeted (only `forge-adapter-gnome` +
`tom-live` still import `tree.js` for `Tree`/`Queue`/`Node`). Proto 154;
Tree/Node/Tree-operations/Tree-layout + d100b L0 green. Nest
`smoke-nest-apps` + `smoke-mark2` PASS. **`tree.js` still ~4.2k** —
classes required until bag-live + no `new Tree`. **Next G8n:** thin
present delegates, peel Queue, fixture retarget, then stub.

2026-09-01 — **D100c c9 done + nest confirm.** `git mv window.js` →
`forge-adapter-gnome.js`; `export class ForgeAdapterGnome`; barrel
exports class; `extension.js` + spies import adapter; fixture keeps
`createWindowManagerFixture` / `windowManager` + `adapter` alias. No
`window.js` / no `WindowManager` export. Proto 154; L0 lifecycle +
layout-controller + d100 disconnect + d100b + focus + bug-311 green.
`./install --dev`; nest `smoke-nest-apps` + `smoke-mark2` PASS (2× TILE
+ join.right → VSPLIT). **Next: G8n** (parked items stay parked).

2026-09-01 — **D100c c8 done.** `adapter-lifecycle.js` (~486):
`queueEvent` / `bindSignals` / `removeSignals` / `enable` / `disable` /
`reloadTree` / `trackCurrentWindows` / `trackCurrentMonWs` /
`bindWorkspaceSignals`. Thin WM wrappers; barrel re-exports.
`window.js` ~4871. Proto 154; L0 lifecycle + d100 / d100b + l64o +
layout-controller + action-pipeline / sources / metrics green. Nest
`smoke-nest-apps` + `smoke-mark2` PASS. **Next: c9** promote
`ForgeAdapterGnome` + delete `window.js`.

2026-09-01 — **D100c c7 done.** `adapter-settings.js` (~144):
`onSettingsChanged` / `handleLayoutModeToggle` /
`syncLayoutVerifyInterval`. Thin WM wrappers; barrel re-exports.
`reloadWindowOverrides` stays on WM. `window.js` ~5295 (was ~5400).
Proto 154; L0 l64o + layout-controller + lifecycle + d100 / d100b +
action-pipeline / sources / metrics green. Nest `smoke-nest-apps` +
`smoke-mark2` PASS. Human tip+re-login: `layout dev` TILE ok; DnD /
Ctrl+hjkl incomplete expected — do not reconnect old handlers.
**Next: c8 lifecycle.**

2026-09-01 — **D100c c6 done.** `adapter-grab-resize.js` (~399):
`resize` / `expand` / `shrink` / `applyOwningSplit` / `handleResizing` +
percent helpers (`normalizeSiblingPercents`, grab anchors, golden-ratio).
`updateMetaPositionSize` stays on WM (grab branch → `_handleResizing`).
Grab begin/end stay drag-drop thin delegates. Thin WM wrappers; barrel
re-exports. `window.js` ~5400 (was ~5653). Proto 154; L0 handle-resizing /
owning-split / grab-fuzz / lifecycle / d100 / d100b / expand / golden /
305 / 34c6 / hs6l / v4wh / 461 / 497 / ox8 / t4 + layout-controller /
action-pipeline / sources / metrics green. Nest `smoke-nest-apps` +
`smoke-mark2` PASS. **Next: c7 settings.**

2026-09-01 — **D100c c5 done.** `adapter-window-signals.js` (~158):
`bindWindowSignals` + `paintTitleChromeLabel`. D100a observe-only kept
(size/pos observe; wm-class/title late PlaceNext + `onLateIdentity` /
label paint; workspace-changed observe; raise-float without renderTree;
entered-monitor stays display-level). Thin WM wrappers; barrel
re-exports. `window.js` ~5653 (was ~5784). Proto 154; L0 d100 / d100b /
lifecycle / focus / floating / open-commit / 461 / r029 +
layout-controller / action-pipeline / sources / tom green. Nest
`smoke-nest-apps` + `smoke-mark2` PASS. **Next: c6 grab-resize.**

2026-09-01 — **D100c c4 done.** `adapter-destroy.js` (~310):
`windowDestroy` + focus-after-close capture/restore + meta id helpers +
ignore-drop (`dropIfIgnored` / `dropAllIgnoredWindows`). Forest remove +
`resyncWmToReality` + paint kept. Thin WM wrappers; barrel exports
destroy core. `window.js` ~5784 (was ~6027). Proto 154; L0 lifecycle /
focus / focus-after-close / ignore / floating / batch-float /
open-commit / insert-slot-split / open-app-policy / 470 / s02h / h7ba /
zo4 / wrot / 6c0e / u7xz / 469 / d100 / d100b + layout-controller /
action-pipeline / sources / render-storm / tom-live green. Nest
`smoke-nest-apps` + `smoke-mark2` PASS. **Next: c5 window-signals.**

2026-09-01 — **D100c c3 done.** `adapter-float.js` (~697): processFloats
/ applyProcessFloatDecision / flags / overrides / toggle / exempt /
ignore match / fullscreen demotion / user-above. `fromPresent` skips
adopt/unwind invent (G2). Thin WM wrappers; present-idle still
`wm.processFloats({ fromPresent: true })`. Barrel exports float core.
`window.js` ~6027 (was ~6456). Proto 154; L0 floating/ignore/batch-float
/ zo4 / 469 / h7ba / d100 / d100b / lifecycle / open-commit /
insert-slot-split / open-app-policy + layout-controller /
action-pipeline / render-storm / source hygiene green. Nest
`smoke-nest-apps` + `smoke-mark2` PASS. **Next: c4 destroy.**

2026-09-01 — **D100c c2 done.** `adapter-present-idle.js` (~140):
`renderTree` idle coalesce (prune → normalizeTabGroups →
`wm.processFloats` → fullscreen demotion → seeded
`presentSeededForest` / unseeded `tree.render` → max-single → chrome →
last-good/save) + `requestLayout` / freeze / `renderWithFreezeState`.
`commitLayout` stays action-pipeline. Thin WM wrappers. Barrel exports
present-idle. `window.js` ~6456 (was ~6537). Proto 154; L0 lifecycle /
d100 / d100b / open-commit / insert-slot-split / open-app-policy /
layout-controller 154/154; action-pipeline + render-storm + source
hygiene 42/42. Nest `smoke-nest-apps` + `smoke-mark2` PASS. **Next: c3
float.**

2026-09-01 — **D100c c0+c1 done.** `window-modes.js` (WINDOW_MODES /
GRAB_TYPES; prod+tests retargeted). `adapter-open-place.js` (~1939):
`openPlaceTrack` + PlaceNext / open-min / open-commit / deferred / dock
sticky; `trackWindow` = validate/ignore → openPlaceTrack →
`mapAdmitWindow`. Thin WM wrappers remain. `window.js` ~6537 (was
~8180). Barrel exports open-place + modes. Proto 154; L0 lifecycle /
d100 / d100b / open-commit / insert-slot-split / open-app-policy
140/140. Nest `smoke-nest-apps` + `smoke-mark2` PASS. **Next: c2
present-idle.**

2026-09-01 — **D100c cut inventory.** ~8180 LOC / ~298 methods left in
`window.js`. First peels: **c0** `window-modes.js` (WINDOW_MODES /
GRAB_TYPES) then **c1** `adapter-open-place.js` (trackWindow front /
PlaceNext / open-min / open-commit). Then c2–c8 peels → **c9** real
`ForgeAdapterGnome` class + delete file. Park H1/session. Do not
façade-rename. Gate each peel: proto + L0 + nest smoke-nest-apps +
smoke-mark2.

2026-09-01 — **D100b done** (extract + residual). Modules:
`adapter-map-admit.js` (+ `onLateIdentity`), `adapter-present.js`,
`adapter-meta-move.js`, barrel `adapter-gnome.js`. Late null `wm_class`
→ FLOAT→TILE without maze reconnect; re-assert TILE after adopt
slotSplit. Proto 154; L0 d100b + d100 disconnect green. Nest:
`smoke-nest-apps` + `smoke-mark2` PASS. `smoke-layout-occupied` flaky
nest crash (not FLOAT). Nest DISPLAY fix in `nested_wayland.py`.
**Next:** D100c peels — **c0–c9 done**; D100c complete.

2026-09-01 — **D100 lock + handler disconnect.** Old Meta idle handlers
are observe-only (`metric d100-observe`). Title → chrome label (D099),
no `renderTree`. Workspace `window-added` no longer rehomes. Grab /
map / destroy / workspace spine stay. H1/session-restore parked on
disk.

2026-09-01 — **Host Nautilus spill.** Empty `DISPLAY=""` was host X11 :0;
`DesktopAppInfo.launch` DBus-activated Nautilus as a child of nest
dbus-daemon (host WAYLAND). Fix: unset DISPLAY; nest dbus-daemon env =
nest Wayland; nest Shell `_spawnArgvDetached` not `info.launch`.
`smoke-nest-apps` PASS with host-spill oracle. Forest-first open/place
landed (WM monitor index / insert parent / no MONITOR TILE park / leftover
PH / merge). G8n still deferred. Hunt: `forge-test nested log`.

2026-08-31 — **R049b residual (NvSe0) — stale shared PH id.** Hunt on
`NvSe0`: YouTube/Gmail/Voice all `attach=id:rhFEW5…` (first mon1.s0 PH).
After YouTube binds it, Voice map `attach=mon-root`; late apply
`tree mon 0→1` without joining TABBED; `forest-match failed mon1.s0`.
**Root (refined):** shared-slot PlaceNext dest is first-PH id; stale after
bind → mon-root; leftover-PH GObject walk misses Forest-only PH.
**Fix:** `findLiveLayoutPlaceholder` + `_resolvePlaceSlotAttachFromHint`
(role/slot → role PH or slot bag) in `_placePlanFromConsumedHint` and late
apply rescue; leftover-PH uses Forest+`liveById`. Tokens:
`place-hint slot-join attach|rescue`. L0
`R049b: stale shared-slot attachSelector still joins TABBED via role PH`.
**Next:** human tip+logout + cold `layout dev` (prove mon1 tab of 3).

2026-08-31 — **R049b host cold + desk heal.** Session `4vEcA` after
install+logout: R050 `groups=2` OK; cold apply
`forest-match failed mon1.s0` (Voice MONITOR sibling). Earlier guess:
late PlaceNext cross-mon rehomed to destMon before TABBED attach;
leftover-PH only on already-in-slot. First fix shipped; **NvSe0 proved
residual** — see note above.

2026-08-31 — **G8o high-risk + nest green.** Do **not** host
`layout dev` from agents without ask.

**G8o high-risk:** `_monitorIndexOfNode` / `_monDirectAncestor` /
`_orderMonChildrenOp` / `_mergeGroupOp` / focus-parent|child / DnD
`parentBefore` → `_membershipParentLive`; window destroy focus-restore
+ open-leaf steal; `focus.js` open-leaf. Thin leftover:
deco/command/DnD previousParent.

**Nest after G8o:** `smoke-layout-ws` + `smoke-toggle-tab` EXIT 0.

**Earlier (join/close):** `liveWindowFromActor` + eager `_closeOp`
Forest remove; CENTER join when GObject `parentNode===null`.

**Next:** human install tip + logout + cold `layout dev` (R049b). Then
thin G8o or G8n/G9 after cold mon1.s0 holds.

2026-08-31 — **R050 + R049 code+L0; nest toggle green (pre close fix).**

**R050:** `_restackTabDecorations` / `_settleAfterRunSteps` enumerate
TABBED/STACKED via `liveStackedOrTabbedConsForPresent` (Forest `walk` +
`liveById` when seeded). Open leaf via `liveTabOpenLeafForPresent`.

**R049:** `forestApplyLayoutStructure` joins sibling TABBED/STACKED;
`alignForestToLiveConParent` no-op. L0 green. Join/close nest signed
off in note above.

**Nest unblockers:** invoke `id:` Forest nanoid; `tiled_windows` skips
FLOAT; float-promote-denied repairs stuck `live.mode=FLOAT` under TILES.

2026-08-31 — **R048 landed (code + L0).** Host job `phase=bind`
`placeholder has no parent` after G8 skeleton PH with
`parentNode===null`. `_bindOp` now uses Forest `tomParent` /
`liveParentForPresent`; seeded path `forestBindWindow` only (no GObject
insert). `_findLayoutPlaceholder` unions Tree WINDOWS + `liveById`.
Dest mon from Forest MONITOR ancestor. `forestBindWindow` clears
`bag.floating` and sets TILE so heal-float-in-tiles cannot yank a
just-bound FLOATS window back.

L0: `session-api-layout-cycle` R048 Forest PH / placeholder-id / FLOATS;
`tom-live` forestBindWindow null-parent + FLOATS. Proto green.
**Do not** host `layout dev`. Nest `smoke-layout-ws` allowed. Human
after nest: `./install --dev` + logout + `layout dev` — no leftover
`forge-ph`, half slots.

**Next:** G8o remaining apply parent via Forest. G8n/G9 after desk bind.

### Classic forge vs this tree (2026-08-31 scan)

**Classic clone:** `/home/luke/dev/me/forge_original` is **missing**
(not under `~/dev/me/`). Remotes here: `origin` `lukebmay/forge`,
`upstream` `jcrussell/forge`. No `forge-ext` remote. Did **not** clone
those trees.

Operator: fine abandoning classic forge; delete STACKED; want a clean
TOM product. Comparison is architecture, not a file dump.

| Axis | Classic (EGO / jcrussell GObject product) | This tree (luke, D096) |
| --- | --- | --- |
| Topology | `class Node extends GObject`; `Tree` *is* ROOT; membership = `parentNode` / `childNodes` | POJO **TOM Forest** (`parentId` / `childIds`, nanoid) + host/session bags. GObject classes still live as residue |
| Layout apply | `tree.render` + percent. Later forks: **belt** + **Mode B** park as recover | **skeleton+bind** + **slot machines** (D008/D009/D042). Belt is a crutch to delete. Mode B = mid-session chaos only, never cold success |
| FLOAT | `WINDOW.mode = FLOAT` still a MONITOR child | **FLOATS** bag, not under MONITOR (D087). R047: GObject chrome park is not TILE intent |
| STACKED | First-class i3 group (vertical title strip) | Same leftover in kernel/chrome/sugar. **G9 delete** (no BC). TABBED stays |
| Settings | gsettings schema sprawl *is* policy | gsettings still persists knobs; **session bag** (`lib/session`: peel/edgeMove) + **host bag** (`lib/host`: Meta/St). **G10** incomplete |
| Size | Sibling **percent** only | TILES in-axis **percent** or **`share`** (`userSized` false) — D090 |

**Verdict:** Architecturally **ahead** of classic (TOM + RuleSet + OpSet
+ adapters + FLOATS + skeleton/bind + share). **Daily driver is behind**
until nest/host load **R048–R050** (bind + tab restack + 3rd-tab join —
L0 green in repo). G8o leftover cosmetic. Nest G3–G8 unsigned.
`docs/dev/architecture.md` still documents the classic GObject tree as
the tiling document.

Do **not** go back to classic GObject topology.

#### G9 STACKED cut inventory

Operator lock: **no BC**. **TABBED stays.** Cycle = H/V/TAB only. After
R048 (shared kernel files). Do **not** implement this breath.

**Kernel** (drop STACKED as a layout; keep TABBED):

- `lib/tom/kernel.js` Layout typedef
- `lib/tom/api.js` cycle order
- `lib/tom/shorthand.js` `STACK` / `STACKED`
- `lib/tom/queries.js` / `sizing.js` / `composed.js` bag tests
- `lib/opsets/mark2.js` `LAYOUT_CYCLE` includes STACKED;
  `mark2ToggleTabStack` TAB↔STACK (retarget: wrap-to-TABBED / no-op on TAB)
- `lib/world/neighbors.js` STACKED as v-axis
- `lib/extension/tree-types.js` `LAYOUT_TYPES.STACKED`
- `lib/epochs/restore.js` `stackedLayout`

**Mark 2 glossary:**
`prototypes/container-motion/src/opsets/mark2.md` (TOM shape, in-axis
table, insert/floor). Same effort as code.

**Chrome:** `present-chrome.js` `processStacked`; `tree-layout.js`
`stackedChildRect`; `decoration.js` stacked strip /
`window-stacked-border`; `window.js` `_handleLayoutModeToggle(STACKED)`,
`updateStackedFocus`, TABBED/STACKED peer reassert; `compat.js` STACKED
orientation note.

**Layout sugar:** `lib/shared/layout-plan.js` `stacked:` / `s` / `stack`;
`docs/user/layout.md` `{ "stack": [...] }`; session save round-trip.

**gsettings / keybind:**

- `stacked-tiling-mode-enabled`
- `default-window-layout` enum `stacked`
- `dnd-center-layout` enum `stacked`
- `stacked-tab-bar-height` (shared height — retarget name to tab-only)
- `con-stacked-layout-toggle` (`<Super>s` / `<Shift><Super>s`)
- `toggleTabStack` (`<Super>n`) — keep as tab wrap/cycle, drop STACK
- prefs `lib/prefs/settings.js` / `appearance.js`

**Tests / docs:** CommandHandler toggleTabStack STACK path;
`Tree-layout.processStacked`; `ungroup-i2` dnd-center stacked; e2e
STACKED lastTabFocus; user `layouts.md` / `troubleshooting.md`;
`docs/dev/architecture.md` LAYOUT_TYPES; CSS `.window-stacked-border` /
`.window-tilepreview-stacked`. Nest `smoke-toggle-tab` retarget TAB-only.

Archive note:
[forge-stacked-layouts](./archived/completed/forge-stacked-layouts.md)
shipped STACKED as product — G9 **supersedes** (operator no-BC).

#### G8o parentNode SoT leftovers

`layout-apply-*.js` has **zero** `parentNode` reads (steps call
session-api). Seeded Forest has `parentId`; G8 live PH/windows often
`parentNode === null`. **R048** `_bindOp` now uses Forest parent.

**Must-fix** (abort or mis-parent):

| Site | Given / abort | Use instead |
| --- | --- | --- |
| `_setLayoutStructureOp` ~1573, `_layoutOp` ~3339, `_layoutCycleOp` ~3563 | `if (!focusNode.parentNode)` → `window has no parent container` | Forest parent; then `forestApplyLayoutStructure` / `forestSetLayout` |
| ~~`forestApplyLayoutStructure` GObject parent pull~~ | **R049:** no-op `alignForestToLiveConParent`; join sibling TABBED on MONITOR | Forest parent wins |
| `_orderOp` fallback ~3116–3182 | `sharedParent` / `monDirects[0].parentNode`; `mon-direct has no parent` | `forestOrderWindows` already first; kill GObject fallback or walk Forest |
| `_monDirectAncestor` ~2967 | Walk `parentNode` to MONITOR | Forest ancestor MONITOR |
| `_dndDropOp` ~4096 | `ontoNode.parentNode` missing → `dnd-drop: onto has no parent`; drop ctx stacked flags from GObject | `liveParentForPresent` |

```text
Given:   Forest PH under MONITOR; live PH.parentNode === null
Actions: ApplyLayout bind
Expect:  forestBindWindow; no apply abort; PH gone
```

**Cosmetic / leftover** (do not abort apply; still wrong SoT):

- `_setLayoutStructureOp` / `_layoutOp` after `forested.ok`:
  `attachNode = parentLive || focusNode.parentNode`
- Fallback lift/wrap in those ops (`parent.childNodes`, `mon.appendChild`,
  `tree.split`) — unseeded only; seeded should not reach
- `_tabSettleFocusNode` `n.parentNode === con`
- `_monitorIndexOfNode` GObject walk
- `_focusParentOp` / `_focusChildOp` `win.parentNode?.isStackedOrTabbed`
- `_mergeGroupOp` sibling pick via `focusNode.parentNode`
- DnD `parentBefore` / `enteredSkipped` GObject identity (Forest can
  move with `parentNode` unchanged → false “skipped”)
- `_bindOp` GObject insert fallback remains **unseeded-only** (R048)

`_sizeOp` is already Forest (`forestSizeWindows`) — no parentNode gate.

2026-08-31 — **R047 fix (code + L0).** Host after G8 tip+logout+`layout
dev`: thin strips, Guake fullscreen orphan, FLOAT under TILES HSPLIT,
order `not found`. Root: align FLOATS→TILES from GObject chrome park +
detached FLOAT resolve miss. Fix: FLOATS wins; `heal-float-in-tiles`;
no float mon-park; bag/`liveById` resolve; apply-steps/metric error
hunt. L0 tom-live + tile-select; proto green. **Human tip+logout
loaded this; R048 L0 is now green (bind abort remaining on host until
tip+logout).** G8a–k + R047 + R048 uncommitted.

2026-08-31 — **Desk calm diagnose (no code).** Tip lag was R046; human
installed dirty G8 tip next → R047 thrash (see above).

2026-08-31 — **Narrow G8j + G8k landed (code + L0).** Node list
mutators fail-closed when seeded (allow: `_allowGObjectCreateNode`
fixtures, `_presentPaintMirror` paint cleanup, spine ROOT/WS, FLOAT
park, chrome detach when Forest id gone). `paintWmForest` always sets
`_presentPaintMirror`. Tree `split`/`group`/`slotSplitUnit`/`removeNode`/
`cleanTree` Forest-first when seeded (fixture allow keeps GObject body).
**Full Node/Tree gut deferred** (G8n). Nest frozen.
**Uncommitted** with G8a–k.

2026-08-31 — **G8i complete (i1–i7 code + L0).** window.js chain
**i2→i3→i6→i7** + parallel **i4/i5** landed. Seeded TILES membership
writes fail-closed Forest-only (no dual-write heal). FLOAT park
`metaMonWsNode.appendChild` kept. Nest frozen. Desk broken.
**Uncommitted** with G8a–i.

2026-08-31 — **G8i/i4 landed (code + L0).** `drag-drop.js` strip reorder /
origin reorder / empty-mon reparent / foreign-strip join → Forest only
(`forestOrderLiveChildren` / `forestReparent` / `forestMergeWindowsIntoGroup`);
no production `replaceChildren` / TILES append splice; fail-closed +
`recordFallback` + resync on Forest miss; D023 no equalize on reorder.
DnD kid reads → `liveChildrenForPresent` / `liveParentForPresent`. L0
tab-strip / drop-intent / R015 / tab-drag / D4 + proto green. WM-drag-drop
GObject-assert failures remain (G8e stale lists).

2026-08-31 — **G8i/i5 landed (code + L0).** session-api hoist/unwrap/
reorder → Forest (`forestHoistNestedMonPanesLive` /
`forestUnwrapUnaryLive` / `forestOrderLiveChildren` + paint); fail-closed
no Forest id; no Node replaceChildren/removeChild/insertBefore in those
three. Unwrap tests assert `liveParentForPresent`.

### G8 sub-slices (enable-safe → gut) — revised 2026-08-31

| Slice | What (precise) | Exit | Status |
| --- | --- | --- | --- |
| **G8a** | Extract `tree-types.js` enums; invent lock `_allowGObjectCreateNode` | Enums + invent lock | ✅ (tip 2026-09-01; was doc-only) |
| **G8b** | WINDOW/CON tab chip → bag `tab`/`tabChip`; destroy clears | Prefer-bag tab write | ✅ |
| **G8c** | Prefer-bag tab reads (DnD + deco) | Shared `tabForNode` | ✅ |
| **G8d** | Bag SoT tab lifecycle; prefer-bag attach/height/active | Node.tab dual-write leftover OK | ✅ |
| **G8e** | Stop paintKids / `replaceChildren` mirror; `liveChildrenForPresent` | No paint mirror | ✅ |
| **G8f** | Extract chrome present off `Tree` → module (`present-chrome.js` or `tom-live`): `processNode` + `processSplit`/`Stacked`/`Tabbed` + `_applyDecorationRect`/`_ensureDecoration`/`_ensureTabRowHosts` + `processGap`/`applyMargins`/`computeSizes` wrapper + tiled filter used by present. `Tree.render`/`processNode`/`getTiledChildren` = **thin delegates**. Keep `skipApply` + `presentWmSlots`. **Keep** `liveChildrenForPresent` GObject fallback. **Do not** delete classes; **do not** Forest-only kids. | `processNode` body not inlined in `class Tree` (wrapper OK). L0 Tree-layout processNode + tab/stack chrome regressions. Proto brake. Call sites may still `tree.render`. | ✅ |
| **G8g** | **Narrow:** seeded `renderTree` + decoration tiled-kids via `liveChildrenForPresent` / extracted helper. **Not** all 146 `window.js` `this.tree` (split/group/attach/remove stay). | Seeded present does not need `Tree.processNode` impl; deco kids Forest-order when seeded. L0 deco + Tree-layout. | ✅ |
| **G8h** | **Narrow:** retarget tests that exercise extracted present; keep `_allowGObjectCreateNode` for Tree-operations / fixtures. | Present tests do not need Tree.processNode as SoT; createNode still test-only. | ✅ |
| **G8i** | Production **topology** walks → Forest (micro-slices i1–i7 below). Leave Clutter actor parents. | Membership SoT ≠ GObject `childNodes` on seeded TILES. | ✅ (i1–i7) |
| **G8j** | **Narrow:** seeded TILES Node list mutators → fail-closed no-op (methods kept). Full gut deferred (FLOAT park / paint cleanup / fixtures). | Seeded TILES no production append/replace | ✅ **narrow** (tip 2026-09-01; was doc-only) |
| **G8k** | **Narrow:** `Tree.split`/`group`/`removeNode`/`cleanTree`/`slotSplitUnit` Forest-first when seeded. Do not delete class. | Seeded topology API = Forest | ✅ **narrow** (tip 2026-09-01; was doc-only) |
| **G8l** | Acceptance greps green | **Not this queue** — `this.tree` remains until managers move | **deferred** |
| **G8m** | Nest matrix sign-off | Nest tape green | **deferred** (desk calm) |
| **G8n** | `tree.js` gone or stub; full Node list gut | File ≤ constants | **in progress** (adapter `new Tree` stopped; classes remain) |

### G8i micro-slices (4.6 — 2026-08-31)

Reads first, then fail-closed writes. Keep `liveChildrenForPresent`
fallback. Prefer existing `forest*` / mark2 / tom helpers — no twin API.
**Do not** dual-write Forest + GObject lists. **Do not** touch FLOAT park
`appendChild` or paint FLOAT `removeChild`. Serialize `window.js` editors
(i2→i3→i6→i7).

| Slice | Files | What | Exit | Status |
| --- | --- | --- | --- | --- |
| **i1** | `command.js`, `drop-intent.js`, `focus.js`, `decoration.js` leftover, `window.js` read sites | Membership **reads** via `liveChildrenForPresent` + tiled filter; parent via Forest/`liveById` when seeded | No `parent.childNodes` as SoT at those sites; L0 command/drop-intent/focus/deco + proto | ✅ |
| **i2** | `window.js` percent helpers; `command.js` resetSiblingPercent | Seeded percents → Forest equalize/repair/size + paint; unseeded TreeLayout | Seeded paths no GObject percent SoT | ✅ |
| **i3** | `window.js` TILES reparent | `forestReparent`/`forestSetLayout` only; delete append/insert fallbacks; fail-closed | No TILES `appendChild`/`insertBefore` except FLOAT park | ✅ |
| **i4** | `drag-drop.js` | `forestOrderLiveChildren` / `forestReparent` only; no `replaceChildren` | No production `replaceChildren` in drag-drop | ✅ |
| **i5** | `session-api.js` hoist/unwrap/reorder | Forest order + `unwrapUnarySplit` + paint; fail-closed | No Node replaceChildren/removeChild in those three | ✅ |
| **i6** | `window.js` destroy/close | Seeded: `forestRemoveWindow` + resync + paint; skip `tree.removeNode` | Seeded close no `tree.removeNode` | ✅ |
| **i7** | `window.js` split/group/flatten | Seeded: `forestSplit`/`forestSlotSplit`/`forestWrap*`/`mark2CleanupUnder` | No seeded `this.tree.split`/`group`/`cleanTree` | ✅ |

**Fan-out:** A=i1 first → then parallel B=i4, C=i5, D=`window.js` i2→i3→i6→i7.
Narrow G8j/k after D ✅. Stop before G8l/n/m.

**Code reality (post-G8g/h):** chrome slot walk lives in
`lib/extension/present-chrome.js`; `Tree.processNode` /
`getTiledChildren` / processSplit|Stacked|Tabbed / decoration ensure =
thin delegates. Seeded `renderTree` calls `PresentChrome.processNode`
directly (no `tree.render` / skipApply wrapper). Deco tiled kids via
`liveChildrenForPresent` + `tree.getTiledChildren`. Unseeded still
`tree.render`. `this.tree` still heavy in `window.js`; `createNode(`
production = invent lock only. GObject `childNodes`/`parentNode` still
stale after Forest ops — do **not** “fix” by Forest-only kids.

### Landed — G8i (i1–i7)

- **i2:** WM `_resetSiblingPercent` / `_insertChildPercent` /
  `_redistributeSiblingPercent` → Forest `equalizeChildren` /
  carve+`repairSharesAfterChildChange` + `paintWmForest` when seeded;
  unseeded TreeLayout. `command.js` float-toggle /
  WindowResetSizes via `liveParentForPresent` + same reset helper.
  Do **not** equalize-always (D023). Proto + Tree-layout + minimize +
  open-commit + CommandHandler Mark 2 (Forest asserts) green.
- **i3:** TILES reparent fail-closed `forestReparent` /
  `forestSetLayout` only; no seeded `appendChild`/`insertBefore` /
  `insertWindowIntoGroup`. FLOAT park kept. Unseeded GObject kept.
- **i6:** seeded destroy/ignore-drop → `forestRemoveWindow` + tab
  destroy + `resyncWmToReality` + `paintWmForest`; skip
  `tree.removeNode`. Snapshot via `liveChildrenForPresent` before
  Forest destroy.
- **i7:** seeded split/slot/tab wrap → `forestWrap*` / `forestSlotSplit`
  / `forestSplit` / `forestWrapForTabStack`; no seeded
  `tree.split`/`group`/`cleanTree`/`slotSplitUnit`. Unseeded flatten
  kept.
- **i4/i5/i1:** prior notes below (parallel + reads).
- **G8i done.** Narrow G8j/k done after.

### Landed — narrow G8j / G8k

- **G8j:** `blockSeededTilesListMutate` in Node
  `appendChild`/`insertBefore`/`replaceChildren`/`removeChild`;
  `recordFallback` + invariant; allow fixture invent flag, paint
  mirror, spine, FLOAT park, absent-Forest chrome detach. Methods
  **not** deleted. Full gut deferred.
- **G8k:** seeded `Tree.split`→`forestSplit`, `group`→
  `forestMergeWindowsIntoGroup`, `slotSplitUnit`→`forestSlotSplit`,
  `removeNode`→`forestRemoveWindow` (+ chrome detach), `cleanTree`→
  `mark2CleanupUnder`+paint. Fixture `_allowGObjectCreateNode` keeps
  GObject bodies. `class Tree` kept.
- L0: Tree-layout / Tree-operations / Tree-cleanup / Tree / tom-live /
  CommandHandler / metrics / Node / prune-dead + proto green.

### Prior — G8h / G8g / G8f / G8e / G8d / G8c / G8a–G8b / G7 / G6 / G5

- G8h/G8g: PresentChrome SoT in tests; seeded `renderTree`; deco tiled
  kids via `liveChildrenForPresent`.
- G8f: `present-chrome.js`; Tree thin delegates; GObject kids fallback.
- G8e: paintKids gone; `liveChildrenForPresent`; metrics forbid
  replaceChildren during present.
- G8d–G8a / G7–G5: bag tabs; invent lock; restore Forest; GetTree;
  chrome Z.

### Remains / implement-now

1. **G8n stub** — peel Tree API off `class Tree`; production ROOT is
   `createLiveTree`. Then G8l (`zero this.tree`). No dual-write.
2. **Park:** G8o cosmetics, G9 STACKED, human logout R049b. No host
   layout from agents without ask. Do not resave loadouts.

**Pitfalls / do-nots (G8i):** Do not Forest-only kids. Do not
`replaceChildren`/`appendChild` as TILES fallback after forest* fails —
fail-closed + metric. Do not skip `paintWmForest` after Forest mutate.
Do not equalize on tab-strip reorder (D023). Do not touch FLOAT park /
paint FLOAT removeChild. Do not dual-write lists “to heal desk.” No
nest/host GUI/loadout. Proto every micro-slice. Serialize window.js.
