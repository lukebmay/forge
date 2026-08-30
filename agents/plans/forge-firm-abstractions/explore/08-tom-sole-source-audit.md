# 08 — TOM as sole live tree (audit)

**As of:** 2026-08-29
**Stale (DnD):** D4 deleted `_executeDropOperation`. Pointer + synthetic
mutate is `_commitResolvedDrop`. Rows below that still name execute as a
live mutator are historical.
**Audience:** operator + next firm-abstractions agent
**Verdict:** live Forge is **hybrid dual-run**. TOM is not the live
tree. Keyboard TILES mutate **projects** GObject → TOM, runs Mark 2,
**apply-backs** onto GObject. The old tree is still the in-memory
forest. Design/HANDOFF already describe this; they do **not** claim
TOM sole-source.

Operator desired state vs code:

| Claim | True in code? |
| --- | --- |
| TOM is the live tree; old tree/actions replaced | **No.** Projection + leftover mutators |
| Host/Meta via unique node id + WeakMap/map | **Partial pattern only.** Session/world WeakMaps exist; live Meta still lives **on** `Node.nodeValue` |
| Nest tests call Mark 2 UX-surface actions (no keys) | **Partial.** Unit/e2e can `command({name})`; nest/CLI/DnD are a different vocabulary |

Newest design wins: D079–D091 + HANDOFF 2026-08-29. Those locks say
**kernel = TOM**, **live = GObject + `tom-live`**, **do not pare
`tree.js` in place**. Operator sole-source is a **next architecture
slice**, not already shipped.

---

### Scope

Opened (this pass; believe code):

- `agents/HANDOFF.md`, `agents/design.md`, `agents/design/CHANGELOG.md`
  (D079–D091)
- `agents/plans/forge-firm-abstractions.md` + `layers.md` + `P5.md` +
  `P6.md` + `P7.md` + `import-map.md`
- `lib/tom/`, `lib/opsets/`, `lib/rulesets/`, `lib/session/`,
  `lib/world/`, `lib/epochs/`, `lib/keybinds/`
- `lib/extension/{forest-run,tom-live,command,keybindings,tree,
  drag-drop,drop-intent,session-api,run-steps,tree-snapshot}.js`
- `lib/shared/keybind-presets.js` `MARK2_VIM_KEYS`
- `prototypes/container-motion/src/opsets/mark2.md`
- Tests: `tests/unit/command/CommandHandler.test.js`,
  `tests/e2e/framework/{bridge.js,input_simulator.py,conftest.py}`,
  `scripts/forge/{test_cli.py,live_matrix.py,nested_wayland.py}`

Did **not** re-dump `window.js` (~7.5k) or `tree.js` render/apply.
Did **not** start nest. Did **not** implement.

---

## Verdict

**`hybrid_dual`.** Live topology is still GObject `Node`/`Tree`. TOM is
an ephemeral clone used for **some** TILES mutates. Old `tree.move` is
no longer the CommandHandler Move path (P6a). It is **not** deleted.
Most writers never project.

**`partial` Mark 2 UX surface.** `WindowManager.command` →
`CommandHandler.execute` can fire dotted ids without keystrokes. That
is not a complete Mark 2 action table, not what nest smokes use, and
not what DnD/RunSteps use.

---

## What design/HANDOFF claim vs what code does

| Source | Claim | Code |
| --- | --- | --- |
| D079 | Kernel = proto TOM; Forge `Node`/`Tree` **discarded as kernel** | Kernel exists under `lib/tom/`. Live tree **not discarded** |
| D080 / D084 | Product Move **is** Mark 2 Move; OpSet at `lib/opsets/` | CommandHandler Move/Join call `runMark2`. `tree.move` still implemented |
| D085 | `WindowManager` façade = ForgeAdapterGnome | Still a god object; role name not a class rename |
| D086 | T6 `windowId`; live `Node.nodeValue` **remains Meta** | Proven: `tree-snapshot.js` `windowIdFromMeta`; `findNode` by Meta |
| D087 / P7 | Forest = META + FLOATS + TILES; floats not under MONITOR | True on **projected** TOM. Live GObject has **no FLOATS node**; `applyLiveForest` parks floats on ROOT |
| D082 / D083 | Session/world WeakMaps keyed by Forest | True for POJO forests. Not a live Meta side-store |
| HANDOFF / P6 | `runLiveForest` is TILES mutate path; DnD leftover `_executeDropOperation` | Proven. Also: RunSteps `dnd-drop` **skips** `resolveDropMark2` |
| HANDOFF **Do not** | Pare GObject `Node` / `window.js` in place | Still the brake. Sole-source needs a **new** slice, not in-place paring |
| import-map (2026-08-27) | `tree.move` discard; `_executeDropOperation` discard as mutator | Intent, **not done** |

**proven** HANDOFF and P6 remainder already say dual-run. Operator
sole-source is **ahead of** the shipped lock, not a stale-doc bug.

---

## Live path (keybind → action → mutate)

```text
gsettings chord
  → Keybindings._bindings[key]()          keybindings.js
  → extWm.command({ name })               window.js:1170
  → CommandHandler.execute(action)        command.js:134
       canonicalCommandName (aliases)
       this._handlers[name](action, ctx)
            │
            ├─ TILES Mark 2 (P6)
            │    runMark2 / runLiveForest     forest-run.js:63
            │      projectLiveForest          tom-live.js:124
            │      wrapMonitorMax1
            │      runOpAbstract (clone+commit)  opsets/transact.js
            │      OpSet.ops[op] | TomApi
            │      applyLiveForest (D023)     tom-live.js:270
            │      commitLayout + settleTabFocus
            │
            └─ leftover Host / tree.*
                 split, group, setLayout, swapPairs,
                 moveIn/Out, swapSibling, float, snap, resize
```

### Action id → handler (CommandHandler)

| Ids | Path | **proven** |
| --- | --- | --- |
| `move.*` / `Move`+dir | `runMark2(..., "move")` | command.js:303–307, 761 |
| `join.*` / `Swap`+dir | `runMark2(..., "join")` | same; Join wins over swap (D080) |
| `toggleSplit` / `LayoutToggle` | OpSet `toggleSplit` | command.js:335 |
| `toggleTabStack` / `LayoutStackTabToggle` | OpSet + settings gates | command.js:91–107 |
| `promote` / `WindowUngroup` / `promoteRecursive` | OpSet | command.js:531–546 |
| `layout.cycle±` | `api.cycleLayout` | command.js:549–564 |
| `size.nudge.*` / `size.share*` / `size.preset.*` | TomApi | command.js:770–799 |
| `focus.*` | **Host** `tree.focus` / `focusParent` / `focusChild` | not OpSet |
| `Split` | `tree.split` | leftover |
| `LayoutStackedToggle` / `LayoutTabbedToggle` | `tree.split` + `tree.setLayout` | leftover |
| `WindowMergeGroup` | `tree.group` | leftover |
| `WindowMoveIn` / `WindowMoveOut` | `tree.moveIn` / `moveOut` | leftover |
| `SwapNext` / `SwapPrev` / `WindowSwapLastActive` | `tree.swapSibling` / `swapPairs` | leftover |
| `Float*` / snap / resize / zoom / prefs | Host | leftover |
| kernel `launch` / `remove` | **no CommandHandler handler** | ACTIONS in `lib/keybinds/actions.js`; Gnome overlay launch is `prefs-app-launch` spawn, not OpSet `launch` |

Keybind table: `lib/keybinds/mark2.js` Super-bearing ids.
`Keybindings._mark2CommandBindings` maps `MARK2_VIM_KEYS` id →
`command({ name: id })`. Safe/i3 overlays fire Join on
`window-swap-*` keys.

### DnD commit

```text
grab / pointer / zones
  → _buildDropOperation
  → resolveDropMark2(src, tgt, op, ctx)     drop-intent.js:305
       mapped → _commitDropMark2
                 runMark2(..., treatGrabTileAsTiles: true)
       null   → _executeDropOperation       drag-drop.js:897
```

**Mapped (OpSet):**

- CENTER into an existing TABBED/STACKED CON when dragged WINDOW is an
  **adjacent sibling of that CON under a CON parent** → `{op:"join", dir}`
- Same-parent CON, in-axis adjacent edge, not MONITOR parent →
  `{op:"move", dir}`

**Fallback (`_executeDropOperation` still mutates GObject):**

- `isSwap` → `swapPairs`
- `shouldMergeCenterGroup` (Join wrap-split ≠ tab merge)
- wrap / detach / invent CON (`shouldCreateCon` / `shouldWrapTargetCon`
  / `shouldDetachWindow`)
- empty-mon, cross-mon leaf-only (R022), MONITOR-parent edge or
  CENTER-into-group, non-adjacent reorder, OpSet fail

Gesture/preview stay in `drag-drop.js` (P6 leftover on purpose).

**Twin:** SessionApi `_dndDropOp` builds the same zone op then calls
`wm._executeDropOperation` **directly** (`session-api.js` ~4228). It
does **not** call `resolveDropMark2`. Nest/live-matrix synthetic DnD
therefore never hits the mapped Mark 2 path.

### Apply / epochs / open

| Writer | Document | Live mutate |
| --- | --- | --- |
| ApplyLayout | GetTree `projectForest` (P5c parked) | GObject + RunSteps-shaped ops |
| Session disk | epoch `windowId` + identity adapter (P5b) | restore onto GObject `Node` |
| H1 / T6 | `lib/epochs/` `windowId` | adapter `tree-snapshot.js` rebuilds GObject (`createCon` = `new Node(CON, St.Bin)`) |
| Open / LFT / PlaceNext | Host policy | `tree.createNode` / `split` / `group` |

Three forest writers stay three (D086). None of them **is** a live TOM.

---

## Dual-path inventory

### A. TOM / OpSet (ephemeral)

| Piece | File | Role today |
| --- | --- | --- |
| POJO Forest + atomics | `lib/tom/` | Kernel. Proto re-exports |
| RuleSet | `lib/rulesets/{core,mark2}.js` | Settle after OpSet |
| Mark 2 OpSet | `lib/opsets/mark2.js` | `move/join/launch/toggle*/promote*/remove` |
| Transact | `lib/opsets/transact.js` | clone Forest + copySession/World + snapshot-commit |
| Session bag | `lib/session/` WeakMap\<Forest\> | `decisions` / `mergeTags` |
| World bag | `lib/world/` WeakMap\<Forest\> | MONITOR workarea; neighbors |
| Projection | `lib/extension/tom-live.js` | GObject ROOT → envelope Forest; `liveById` Map |
| Runner | `lib/extension/forest-run.js` | project → mutate → apply-back → one `commitLayout` |
| Epochs | `lib/epochs/` | T6 **snapshot algorithm**, not live tree |

### B. GObject tree (still live source of truth)

| Piece | File | Still authoritative? |
| --- | --- | --- |
| `Node` GObject | `tree.js:115` | **Yes.** Meta/St in `_data`, chrome in ctor, `mode`, `percent`, `rect` paints actors |
| `Tree` is ROOT | `tree.js` | **Yes.** `createNode`, `findNode(Meta)`, render/apply, snapshot wrap |
| Child list D023 | `appendChild` / `insertBefore` / `removeChild` / `replaceChildren` | **Yes.** `applyLiveForest` writes through these. SessionApi `_moveOp` also uses them **without** OpSet |
| `tree.move` | `tree.js:1863` | Implemented. CommandHandler **does not** call it. Tests/regressions still do |
| `tree.split` / `group` / `ungroup` / `swapPairs` / `setLayout` / `resetSiblingPercent` / `moveIn` / `moveOut` / `cleanTree` | `tree.js` | **Yes** for leftover CommandHandler, DnD execute, RunSteps, open |
| `mode: FLOAT/GRAB_TILE` on WINDOW | Node | Live float flag. TOM FLOATS is projection-only |
| `findNode` | `tree.js:1557` | `getNodeByValue` — Meta or WS/mon **string** ids. CON is St.Bin, **no** durable id |

Comment at `tree.js:1549` still claims CON ids `mo{m}ws{n}c{x}`.
**proven stale:** CON ctor takes `St.Bin`; projection assigns `n1, n2…`
per run.

### C. Dual writers (same user intent, two mutators)

| Intent | Mark 2 / OpSet path | Old path still live |
| --- | --- | --- |
| Directional Move | CommandHandler `move.*` → `runMark2` | `tree.move`; DBus/RunSteps `_moveOp` = D023 reparent to dest |
| Directional Join | `join.*` → `runMark2` | DnD CENTER merge-group; `tree.group` |
| Toggle split / tab-stack | OpSet | `LayoutStackedToggle` / `LayoutTabbedToggle` / RunSteps `layout` + `layout-cycle` → `tree.setLayout` |
| Promote | OpSet `promote*` | RunSteps `ungroup` → `tree.ungroup` |
| Size share/nudge | TomApi via `runLiveForest` | `WindowResetSizes` / expand / shrink / golden / RunSteps `size` |
| DnD | `resolveDropMark2` subset | `_executeDropOperation`; RunSteps `dnd-drop` **always** execute |
| Swap last / cyclic | — | `swapPairs` / `swapSibling` |
| Launch / open | OpSet `launch` (proto + kernel) | LFT / PlaceNext / `prefs-app-launch` spawn |
| Remove | OpSet `remove` (WebView overlay `q`) | Gnome `host.quit` / Meta delete |
| Tab-strip reorder | — | `replaceChildren` + `commitLayout` (D046) |
| Apply | — | GetTree + slot machines (P5c parked) |

---

## Mark 2 as nest-test UX surface

### What already bypasses keystrokes

**proven**

1. **Unit:** `wm.command({ name: "move.left" })` /
   `CommandHandler.execute` — `CommandHandler.test.js` live-tree cases
   (~912+) assert OpSet apply-back on GObject children.
2. **E2E default:** `InputSimulator.dispatch_mode = "dbus"` →
   `shell_proxy.invoke_forge_action` → `ext.extWm.command(action)`
   (`input_simulator.py:128–182`, `bridge.js:1332`). Default **avoids**
   Super+key. `--dispatch-mode=keybinding` is the optional key lane.
3. **Product CLI:** DBus `RunSteps` / `Move` / `Swap` / `Focus` — **not**
   kernel action ids. `Move` is dest-reparent (`_moveOp`), not Mark 2
   `move.left`.

### What is missing for “every user scenario as Mark 2”

| Gap | Why nest cannot emulate it as an action id today |
| --- | --- |
| No nest/CLI `invoke(id)` | `forge-test nested` is a Shell host. Smokes use `forge ping/tree/layout`. No helper that takes `move.left` / `join.right` |
| CommandHandler needs **focus Meta** | `execute` uses `wm.focusMetaWindow`. Tests override `get_focus_window`. Nest would need selector+focus, or execute must take a target |
| Kernel `launch` / `remove` unwired on Gnome | Cannot nest-call OpSet Launch/Remove |
| Split / merge-group / stacked-or-tabbed **toggles** | Still PascalCase Host bodies, not Mark 2 (or two product verbs for one OpSet) |
| Float / snap / zoom / resize-grab | Host-only; not OpSet |
| **DnD** | Not an action id. E2E real drag xfails headless. `fuzzDrag` / RunSteps `dnd-drop` skip `resolveDropMark2`. Empty-mon / wrap / invent / swap / merge-group still execute |
| Tab chrome DnD | D046 `replaceChildren`, not Mark 2 |
| Open-app | LFT/dock/mins — not `launch` |
| Apply | GetTree planner, not TOM |
| RunSteps vocabulary ≠ `ACTIONS` | `move`/`swap`/`layout`/`dnd-drop` vs `move.left`/`join.left`/`toggleSplit` |

Operator bar: “every user action including GUI DnD expressible as Mark 2
so nest can emulate every scenario.” **Not met.** Closest: e2e dbus
CommandHandler + incomplete DnD execute.

---

## Id + map side-store

Operator idea: unique **node id** + WeakMap/map for Host/Meta
(session/world already in design).

| Bag | Key | Value | Matches operator? |
| --- | --- | --- | --- |
| `lib/session/` | **Forest object** WeakMap | `decisions`, `mergeTags` | Same **pattern** (side store, not on Node). **Wrong payload** (OpSet prefs, not Meta) |
| `lib/world/` | **Forest object** WeakMap | MONITOR `{x,y,width,height}` | Same pattern. Workarea, not window identity |
| `tom-live` `liveById` | string id → GObject Node | Per `runLiveForest` only | Closest to id→host. **Ephemeral**; discarded after apply-back |
| WINDOW id | `windowIdFromMeta` = `Meta.get_id()` | Host-owned; churns on HUP | Not a Forge-stable node id |
| CON id | `n${conSeq++}` in `projectLiveForest` | Regenerated **every** project | Not unique across commands |
| MONITOR / WS | live `nodeValue` strings `moNwsW` / `wsN` | Stable enough for spine | Not a unified id scheme |
| Live Meta | `Node.nodeValue` / `_data` | **On the node** | Opposite of side-store |
| T6 / session portable | `windowId` string | Epoch document + identity adapter | Snapshot identity, not live TOM id |

**proven** D086 still says live `Node.nodeValue` remains Meta until a
later surface import. That import **did not happen**.

What would match the operator: durable `id` on every TOM node (CON
included); live Forest **is** the tree; `WeakMap<id, Meta>` /
`WeakMap<id, St>` filled by ForgeAdapterGnome. Session/world stay
Forest-keyed. Today session/world prove the **bag** idea; they do not
store host objects.

---

## Intended layer vs actual

| Layer (layers.md) | Intended | Actual live |
| --- | --- | --- |
| TOM | Sole topology | Clone for some TILES mutates |
| RuleSet / OpSet | Only TILES mutate | CommandHandler subset + mapped DnD |
| Host adapter | Signals, paint, bags | Still policy + `tree.*` + open + Apply glue |
| Surfaces | Intent → OpSet / epoch | Three Moves (keybind Mark 2, DBus reparent, DnD execute) |
| Epochs | Three writers on TOM snapshots | Snapshots are `windowId` docs; restore rebuilds GObject |
| FLOATS | Bag, not under MONITOR | Projection only; apply parks on ROOT |

---

## Strengths (keep)

- Kernel **is** gi-free TOM + RuleSet + OpSet + action ids. Proto
  re-exports. Brake `prototypes/container-motion && npm test` (154).
- CommandHandler Move/Join/toggle/promote/size **do** go through one
  runner (`forest-run.js`). Product Move **is** Mark 2 for that surface.
- D023 child-list is the apply-back chokepoint. Do not reintroduce
  `childNodes =` assigns.
- Session/world WeakMaps are the right **shape** for side state.
- E2e already prefers `command()` over keystrokes (forge-3xz).
- H1 dual monitor-resolve and ApplyEpoch-as-sole-writer during apply
  stay product strategy (do not merge).

---

## Weaknesses / duck-tape

| Failure class | Symptom | Why the abstraction is wrong |
| --- | --- | --- |
| Dual topology | Every Mark 2 op copies the forest, mutates POJO, writes back | Two trees can disagree (FLOATS vs ROOT parking; CON id churn; extras hoist) |
| Dual mutators | Same verb, two bodies (`move.*` vs `_moveOp` vs `tree.move`) | Nest/CLI/DnD will not match keyboard Mark 2 |
| DnD twin | Pointer path may OpSet; RunSteps always execute | Tests that “emulate DnD” miss the mapped Join/Move |
| Identity | Meta on Node; CON has no id | Cannot key a Host map; projection must invent ids |
| FLOATS lie | Live tree has no FLOATS node | Envelope exists only while `runLiveForest` is on the stack |
| leftover CommandHandler | Split / merge / stacked toggle / moveIn | Second tiling policy pack beside Mark 2 |
| Apply parked on GetTree | P5c | Desired forest is not TOM |

---

## Twins / bypasses

| Named API | Twin |
| --- | --- |
| Mark 2 Move (`runMark2`) | `tree.move`; SessionApi `_moveOp` insertBefore/appendChild |
| Mark 2 Join | `tree.group` / `mergeWindowsIntoGroup`; leftover DnD CENTER |
| `resolveDropMark2` + `runMark2` | `_executeDropOperation`; `_dndDropOp` → execute |
| OpSet `toggleSplit` / `toggleTabStack` / `cycleLayout` | `LayoutStackedToggle` / `LayoutTabbedToggle` / `_layoutOp` / `_layoutCycleOp` |
| OpSet `promote` | `_ungroupOp` → `tree.ungroup` |
| Kernel `ACTIONS` | RunSteps `EXTENSION_OPS`; PascalCase command names |
| D023 on live Node | `applyLiveForest.replaceChildren` **and** SessionApi/open/H1 splicing the same methods as **policy** |

---

## Open questions

- **guess:** Operator sole-source means “live Forest is POJO; GObject
  Node dies” vs “GObject Node becomes a thin id+actor handle, Forest
  lives beside it.” Design still says do not pare `tree.js` in place.
  Need a meeting if the next slice is a live-Forest cutover.
- **guess:** Whether DnD wrap/invent/empty-mon should become **new**
  Mark 2 ops vs existing Join/Move once max-1/MONITOR rules cover them.
- **proven leftover:** first Move/Join on n-child MONITOR wraps max-1
  (P6 note). Product vs old even-N split.

---

## What later agents must not rediscover

1. Live Forge **dual-runs**. `tom-live` is a projection, not the tree.
2. `tree.move` unused by CommandHandler ≠ deleted.
3. RunSteps `dnd-drop` **bypasses** `resolveDropMark2`.
4. FLOATS is not a live GObject node; apply parks floats on ROOT.
5. Session/world WeakMaps are Forest-keyed prefs/workarea, not Meta maps.
6. CON ids `n1…` are per-projection. WINDOW id is Meta `get_id()`.
7. Kernel `launch`/`remove` are not Gnome CommandHandler ids.
8. Do not merge `resolveTargetMonitor` / `resolveStrictMonitor`.
9. Do not retarget Apply onto T6 (P5c parked).
10. Do not invent a second Mark 2 glossary. Words:
    [`mark2.md`](../../../../prototypes/container-motion/src/opsets/mark2.md).

---

## Recommended next slices (no implement this run)

Order is architectural, not PRIORITY. Do not start pinned-slots.

1. **Lock the cutover.** Operator sole-source vs HANDOFF “do not pare
   Node in place.” Write the live-Forest target: durable node ids;
   Forest is topology; adapter WeakMap id→Meta/St; FLOATS node on live
   document. Then CHANGELOG a new D-row. Until that lock, agents will
   keep shipping projection.

2. **One mutate surface.** All TILES user verbs (including leftover
   Split/merge/toggle/moveIn/tab-reorder) become kernel action ids →
   `runLiveForest` / OpSet. Delete CommandHandler `tree.split` /
   `tree.group` bodies in the same slice.

3. **DnD execute → Mark 2.** Map wrap/invent/empty-mon/swap/merge-group
   (or explicitly add SurfaceOps). `_executeDropOperation` discard as
   mutator (import-map). **Same path** for pointer commit **and**
   RunSteps `dnd-drop` / e2e `fuzzDrag`.

4. **RunSteps / DBus speak `ACTIONS`.** `move.left` not dest-reparent
   `move`. Keep dest-reparent as Apply/planner if needed, under a
   different op name.

5. **Nest/e2e invoke.** One `forge-test` / DBus method:
   `command({name: id, selector?})` covering the full Mark 2 table plus
   mapped DnD (`dnd.join.right` or zone→resolve→same runner). Default
   nest smokes must not send Super+key.

6. **Id map.** Persist CON/WINDOW/MONITOR ids on the live document;
   `liveById` becomes the adapter table (or WeakMap), not a per-op Map.
   Peel Meta off `Node.nodeValue` only after that table exists.

7. **FLOATS on live.** Stop parking floats on ROOT. Live envelope
   matches D087 even when Mark 2 is not running.

8. **Parked:** P5c Apply→TOM; `tree.move` deletion after regressions
   retarget; GObject `Node` ctor chrome split (presenter leak).
