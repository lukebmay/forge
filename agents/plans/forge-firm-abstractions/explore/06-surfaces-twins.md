# Surfaces and twins — spaghetti call-site map

**As of:** 2026-08-27
**Domain:** surfaces-twins

Cite, do not dump. Vocabulary: Mark 2
[`mark2.md`](../../../../prototypes/container-motion/src/opsets/mark2.md).
Claimed catalog:
[`docs/dev/contracts.md`](../../../../docs/dev/contracts.md).
Stage formulas:
[`docs/dev/actions.md`](../../../../docs/dev/actions.md).

---

### Scope

Opened:

- `docs/dev/contracts.md`, `docs/dev/actions.md`
- `lib/extension/session-api.js` (DBus XML + method groups; not a dump)
- `lib/extension/run-steps.js`, `tile-select.js`
- `lib/extension/drag-drop.js`, `drop-intent.js`, `drop-zones.js`
- `lib/extension/command.js`, `keybindings.js`
- `lib/extension/lft-mru.js`, `open-min-place.js`
- `cli/forge.mjs`, `cli/dbus.mjs`, `cli/README.md`, leftover
  `scripts/forge/forge` subparsers
- `lib/shared/` inventory (gi-free vs gi)
- `lib/prefs/` + `prefs.js` as GTK surface only
- Twin greps in `lib/` for `lastTabFocus =`, `childNodes =`,
  `parent.layout =`, `revealGroupChild`, `commitLayout`, `renderTree`,
  `windowIsSettled`

Did **not** open: full `window.js` / `tree.js` (those are 02/03 notes);
Mark 2 `mark2.mjs` bodies; prefs GTK widget internals beyond entry;
Python layout apply spine beyond leftover-command list.

---

### Current objects (as the code is)

| Name | File:symbol | What it actually does today |
| --- | --- | --- |
| Keybind registry | `keybindings.js` `Keybindings.buildBindingDefinitions` (~L162) | `Main.wm.addKeybinding` → `wm.command({ name, … })`. Cheatsheet / lock / app-launch bypass CommandHandler. |
| CommandHandler | `command.js` `execute` / `_handlers` | Focused-window ops: `tree.move` / `swap` / `group` / `ungroup` / `setLayout` / float / zoom / snap. Then `commitLayout`. |
| WM command shim | `window.js:command` (~L1170) | One-liner to CommandHandler. |
| DragDropManager | `drag-drop.js` | Gesture (titlebar grab + tab chrome) **and** structure execute (`_executeDropOperation`). Preview paint lives here too. |
| Drop zones | `drop-zones.js` `buildDropZones` / `hitTestDropZone` / `zonePaintRect` | Pure five-zone geometry + paint rects. No tree. |
| Drop intent | `drop-intent.js` `dropChangesStructure` / `dropWouldOverflowMins` | Pure “would this drop change parent/order/layout?” + min refuse. |
| Tab-strip reorder | `drag-drop.js` `applyTabStripReorder` + `_commitTabStripReorder` (~L3601) | Preview-only mid-drag; commit = `replaceChildren` + one C. |
| RunSteps schema | `run-steps.js` `EXTENSION_OPS` / `parseStepsPayload` / `runStepsDispatch` | gi-free op list + dispatcher. CLI-only ops (`launch`/`wait*`) rejected. |
| Session DBus | `session-api.js` `SessionApi` | 18 methods + 2 signals. Public methods call `_focusOp` / `_moveOp` / … RunSteps freeze → dispatch → one C. |
| ApplyLayout bag | `layout-apply-run.js` via `session-api._ensureLayoutApplyRuns` | Epoch + slot machines. Structure half **reuses** RunSteps handlers with `layout` swapped to `_setLayoutStructureOp`. |
| Tile selectors | `tile-select.js` `parseSelector` / `matchNodes` | `focus`/`lft`/`id:`/`class:`/`title:`/`path:`. CLI + DBus share this. |
| Tree JSON | `tree-query.js` `projectForest` | GetTree / ApplyLayout snapshot. Not TOM. |
| Open-app plan | `lft-mru.js` `resolveOpenAppPlacement` + `window.js` `_planOpenAppPlacement` (~L3863) | Dock sticky → empty-head → window-actual → LFT. Policy, not tree splice. |
| Open-min / overflow | `open-min-place.js` + `window.js` `_ensureTabbedForOpen` / `_rehomeOverflowToTab` | Same-mon tab BFS else float. Then `tree.split` / `tree.group` / `insertWindowIntoGroup`. |
| CLI PATH | `cli/forge.mjs` `NODE_COMMANDS` | Thin: Node bodies or leftover Python. Jobs wrap mutators. |
| DBus client | `cli/dbus.mjs` `callMethod` | `gdbus` → JSON string. Mirrors XML method names. |
| Prefs | `prefs.js` + `lib/prefs/*` | GTK4/Adwaita pages bind gsettings. No tree. |
| Settings pures | `lib/shared/settings-keys.js`, `settings-control.js`, `keybind-presets.js` | Allowlists / kits. Shared by prefs, DBus SetSetting, `forge keybind`. |

DBus XML (`session-api.js` ~L91–173) — group by product job, not file order:

| DBus method | In | Body | Job |
| --- | --- | --- | --- |
| `Ping` | 0 | health JSON + `SESSION_API_VERSION` (11) | liveness |
| `GetTree` | options JSON | `projectForest` | observe |
| `Focus` / `Swap` / `Move` | selectors | `_focusOp` / `_swapOp` / `_moveOp` | interactive + RunSteps cores |
| `PlaceNext` | options JSON | `wm.placeNext` | next-map pin |
| `GetSetting` / `SetSetting` | key / json | gsettings via `settings-control` | prefs twin |
| `SettingsSave` / `SettingsLoad` | name | portable profile JSON | prefs twin |
| `RunSteps` | steps JSON | freeze → `_runStepHandlers` → one C `"run-steps"` | batch control plane |
| `LayoutBatch` | action string | begin/end/admit/chrome | **legacy multi-open** |
| `SaveSessionLayout` | 0 | flush last-good forest | install/HUP |
| `GetThrashCatalog` | 0 | settle/thrash debug | hunt |
| `ApplyLayout` / `GetLayoutApply` / `CancelLayoutApply` | request / id | `LayoutApplyRunBag` | product `forge layout` |
| `Log` | request JSON | session level / persist / truncate | hunt |
| signals `LayoutApplyProgress` / `LayoutApplyDone` | — | bag callbacks | apply observe |

RunSteps ops (`run-steps.js` `EXTENSION_OPS`): ping, focus, swap, move,
layout, layout-cycle, merge-group, group, ungroup, focus-parent,
focus-child, move-in, move-out, dnd-drop, float, order, size,
place-next, set, close, unfocus, skeleton, bind.

Keybind → CommandHandler names (`keybindings.js` ~L162–268):
Focus/Swap/Move (4 dirs), FocusNext/Prev, SwapNext/Prev, Split,
LayoutToggle / Stacked / Tabbed / StackTab, WindowMergeGroup /
Ungroup / MoveIn / MoveOut, FocusParent/Child, float toggles, zoom,
snap thirds, expand/shrink/golden, gaps, prefs/config, cheatsheet.

---

### Intended layer vs actual layer

Target: **Surfaces** translate intent → OpSet / epoch. They must not
own a private tree-mutation API.

| Object | Target layer | Actual today |
| --- | --- | --- |
| `keybindings.js` | Surfaces | Surfaces (good). Payload is Forge command names, not Mark 2 ops. |
| `command.js` | Surfaces → OpSet | Surfaces **plus** TreeOps calls **plus** a few field writes (`lastTabFocus`, snap `rect`). |
| `drop-zones.js` / `drop-intent.js` | Surfaces (gesture math) | Clean pures. Keep. |
| `drag-drop.js` execute | Surfaces | **OpSet + TreeOps + Presenter** in one class: splice, `new Node(CON)`, `childNode.layout =`, preview actors, tab chrome. |
| `session-api.js` public methods | Surfaces | Surfaces (JSON in/out). Cores (`_moveOp`, `_layoutOp`, `_dndDropOp`) mutate via Node APIs / DnD execute. |
| `run-steps.js` | Surfaces schema | Surfaces schema. Names are Forge ops, not Mark 2. |
| ApplyLayout | Epochs | Epochs **calling** RunSteps (third control plane wrapping the second). |
| `tile-select.js` / `tree-query.js` | Surfaces observe | Observe. Fine. |
| `lft-mru.js` / `open-min-place.js` | Product data / Surfaces policy | Policy pures. WM then mutates tree. |
| `lib/shared/layout-plan.js` | Product data | Product IR (profile → plan actions). **Not TOM.** |
| `lib/shared/settings.js` | Product data + Host | GJS ConfigManager. Not kernel. |
| `lib/prefs/` | Surfaces | GTK only. Writes gsettings / `windows.json`. |
| CLI | Surfaces | Thin gdbus / leftover Python. |

Contamination in one line: **DnD and DBus Move/order/layout-lift are
private mutators sitting on the surface layer.**

---

### Strengths (keep)

- Keybinds are a thin name map (`wm.command`). No tree code in
  `keybindings.js` except cheatsheet/lock/spawn.
- RunSteps freeze → many M → **one** C (`"run-steps"`) matches
  `actions.md` StructureChanged. ApplyLayout copies that recipe
  (`_runApplyLayoutSteps` ~L1441).
- D0 split is real: zones (geometry) / intent (no-op + mins) /
  execute (tree). Catalog rows for those jobs match the files.
- Tab-strip reorder commit uses `replaceChildren` + one
  `commitLayout("tab-strip-reorder")` — catalog-faithful.
- DBus Focus goes through `revealGroupChild` (`_focusOp` ~L2728).
- Product layout waits are in-process ApplyLayout, not CLI GetTree
  poll (`contracts.md` Settle). CLI `windowIsSettled` is launch-only.
- `tile-select` + `projectForest` are the observe grammar CLI and
  Shell share.
- Prefs never touch the tree.

---

### Weaknesses / duck-tape

| Failure class | Symptom in code | Why the abstraction is wrong |
| --- | --- | --- |
| Three control planes | Keybind `command.js`; DBus `RunSteps` / `_moveOp`; ApplyLayout `_runApplyLayoutSteps` (same handlers, `layout` swapped) | Same user job (move/join/set layout) has three recipes and three commit reasons (`move-window` / `session-move` / `apply-layout`). |
| Second structure engine | `DragDropManager._executeDropOperation` (~L895) inserts CONs, flips `.layout`, swapPairs, merge, wrap, detach | Catalog says execute drop → merge/split. Implementation is a **private OpSet** with flags (`shouldCreateCon`, `shouldWrapTargetCon`, `shouldDetachWindow`) that Mark 2 already named Join / Move / wrap. |
| Two Moves | Keybind `tree.move(node, direction)` vs DBus `_moveOp(selector, dest)` insert-after / append | Same English word, different geometry. Mark 2 Move is neither (directional container motion + settle). |
| Surface splices | `_moveOp` `insertBefore`/`appendChild` (~L2860); `_reorderParentChildren` `replaceChildren` (~L3438); `_layoutOp` lift `mon.appendChild` (~L3554); `_skeletonOp` `monNode.layout =` (~L4503) | Surfaces own TreeOps instead of calling named ops. |
| Layout field writes | DnD `childNode.layout =` (~L952–1007); `tree.split` toggle `parentNode.layout =` (~L2895); open-min `tabCon.layout = TABBED` (`window.js` ~L4844) | Catalog: `tree.setLayout`. Field write skips I1 opts (`lastTabFocus`, `resetPercents`). |
| LTF field writes | Command Move ~L206; stacked/tabbed toggles ~L409/~L467; `tree.merge` ~L2255; pin fallback `window.js` ~L2480 | Catalog: `revealGroupChild` / `setOpenLeaf` for live show. Snapshot persist is allowed. |
| ApplyLayout vs RunSteps layout | `_runApplyLayoutSteps` overrides `layout` → `_setLayoutStructureOp`; interactive RunSteps uses `_layoutOp` (lift nested) | Two layout ops on one dispatcher. Epoch policy leaked into the batch engine. |
| LayoutBatch leftover | `LayoutBatch` begin/end/chrome still exported | Product entry is ApplyLayout. Batch is a previous control plane still on the bus. |
| CLI TILE-anywhere | `cli/launch-lib.mjs` `windowIsSettled` (~L715) = TILE + sane rect + mon≥0 | Catalog forbids TILE-anywhere as **layout** success. Launch wait is the allowed leftover — easy to copy into layout by accident. |
| Python leftover twins | `scripts/forge/forge` still has `cmd_ping`/`cmd_tree`/… **and** `layout_plan.py` next to `lib/shared/layout-plan.js` | Two CLIs, two planners. PATH uses Node; Python spawn for `layout` / install / jobs / thrash. |

---

### Twins / bypasses

Catalog job → named API vs the hand-rolled path. Product `lib/` hits
only (tests omitted unless they show the mock encouraging the twin).

#### Child list

| Catalog | Named | Twin / bypass | Notes |
| --- | --- | --- | --- |
| Tree child list | `Node.appendChild` / `insertBefore` / `removeChild` / `replaceChildren` | **No** product `childNodes =` in `lib/` | Setter **still exists** `tree.js` `set childNodes` ~L218. Tests assign it. |
| same | those methods | `set parentNode` still public `tree.js` ~L287 | Used *inside* Node methods. Tests assign outside. |
| Tab-strip reorder | `applyTabStripReorder` + `replaceChildren` | (none on commit path) | `_commitTabStripReorder` ~L3644 is canonical. |

#### Open leaf / reveal

Catalog: live “show this tab” = `wm.revealGroupChild`. Snapshot may
write LTF as **data**. `setOpenLeaf` (`focus.js` ~L120) is the LTF
writer reveal uses.

| Site | What | Verdict |
| --- | --- | --- |
| `action-pipeline.js` `revealGroupChild` ~L236 | writes via `setOpenLeaf` then raise | **canonical** |
| `session-api._focusOp` ~L2728 | `revealGroupChild` | **canonical** |
| `command.js` FocusParent/Child, merge, tabbed toggles | `revealGroupChild` | **canonical** |
| `command.js` Move ~L206 `prev.parentNode.lastTabFocus = prev.nodeValue` | keep origin group leaf after peel | **twin** of `setOpenLeaf` (no raise — data-only, but not via named writer) |
| `command.js` LayoutStackedToggle ~L409 / LayoutStackTabToggle ~L467 `parent.lastTabFocus = null` | clear leaf when leaving tabs | **twin** of `setLayout(..., { lastTabFocus: null })` (tabbed-off path already uses opts ~L430) |
| `tree.js` `_activateFromTab` ~L899 / ~L906 | `parent.lastTabFocus =` + raise + `afterFocus` / `updateTabbedFocus` | **dead fallback** if `revealGroupChild` missing |
| `tree.js` `insertWindowIntoGroup` ~L2255 `group.lastTabFocus = windowNode.nodeValue` | join sets leaf to new member | **twin** (should be reveal/setOpenLeaf after join) |
| `tree.js` `Node.setLayout` ~L1114 | `this.lastTabFocus = opts.lastTabFocus` | **allowed** (I1 chrome opts) |
| `focus.js` `setOpenLeaf` ~L144 | the writer | **canonical** |
| `window.js` `pinLayoutOpenLeaf` ~L2480 | `parentCon.lastTabFocus = meta` if no node | **fallback twin** |
| `window.js` `restoreLayoutOpenLeafIfStolen` ~L2529 | same if pin node gone | **fallback twin** |
| `window.js` `_ensureTabbedForOpen` ~L4845 / `_maybeAspectSplitForOpen` ~L4896 | `tabCon.lastTabFocus =` after split | **twin** + `.layout = TABBED` |
| `session-layout.js` `syncLastTabFocusFromFocus` ~L71 | fill empty LTF from kbd on **save** | **allowed** (catalog: session save may) |
| `tree-snapshot.js` ~L305 / ~L426 | restore descriptor LTF | **allowed** (data) |
| `session-api` layoutOpts `lastTabFocus:` ~L1682 / ~L3619 | passed into `setLayout` | **allowed** |
| `window.js` Meta-rehome ~L6052 `updateTabbedFocus` after `_rehomeWindowPreservingContainer` | adopt argument as leaf | **twin** of reveal; catalog: do not call `updateTabbedFocus` on kbd when pin must win |
| `session-layout-restore.js` ~L710 | `updateTabbedFocus` if reveal missing | **fallback twin** |
| `session-api._settleAfterRunSteps` ~L2469 | `settleTabFocus` else `updateTabbedFocus` | settle is chrome, not reveal |

#### Layout mode

Catalog: `tree.setLayout` / `Node.setLayout`. Do not assign
`parent.layout`.

| Site | Write | Verdict |
| --- | --- | --- |
| `command.js` toggles | `wm.tree.setLayout` | **canonical** |
| `session-api._layoutOp` ~L3643 / `_layoutCycleOp` ~L3738 / `_setLayoutStructureOp` ~L1703 | `tree.setLayout` | **canonical** (two *policies* though) |
| `drag-drop._executeDropOperation` ~L952–1007 | `childNode.layout =` / `containerNode.layout =` / force TABBED | **forbidden twin** |
| `tree.split` ~L2895 / new CON ~L2906 | field write | TreeOps kernel — reshape to `setLayout` |
| `tree.move` peel ~L1992 `parentTarget.layout = determineSplitLayoutForRect` | field write | TreeOps |
| `tree.cleanTree` flatten ~L3385 `parent.layout = child.layout` | unary-collapse inherit | TreeOps (Mark 2 settle, not surface) |
| `window.js` leftover slot + tabCon ~L4844 / ~L4895 | `tabCon.layout = TABBED` | **twin** of `setLayout` after `split` |
| `session-api._skeletonOp` ~L4503 `monNode.layout =` | epoch skeleton | Epochs; still a field write |
| `session-api` create CON ~L4679 `con.layout = layout` | helper | **twin** |
| `monitor.js` / `workspace.js` / `monitor-recovery.js` | spine MONITOR layout | Host/recovery — not surfaces |

#### Group / ungroup / move in-out

Catalog: `tree.group` / `ungroup` / `moveIn` / `moveOut`. CENTER group
via `mergeWindowsIntoGroup`.

| Site | Call | Twin |
| --- | --- | --- |
| `command.js` WindowMergeGroup ~L533 | `tree.group` | canonical |
| `command.js` WindowUngroup / MoveIn / MoveOut | `tree.ungroup` / `moveIn` / `moveOut` | canonical |
| `session-api` `_mergeGroupOp` / `_ungroupOp` / `_moveInOp` / `_moveOutOp` | same tree APIs | canonical (good: DBus matches keybind) |
| DnD CENTER `shouldMergeCenterGroup` | `mergeWindowsIntoGroup` ~L928 | canonical for *that* case |
| DnD other CENTER / edge | insert + `.layout =` / wrap / detach | **second group engine** |
| `window.js` overflow ~L4747 | `tree.group` / `insertWindowIntoGroup` | canonical TreeOps, called from Host |

#### Commit / focus chrome

Catalog: `wm.commitLayout`; no second `renderTree` in the same
gesture; focus = `afterFocus` not `renderTree("focus")`.

| Site | Notes |
| --- | --- |
| `command.js` | `commitLayout` everywhere that mutates (good). Float/move still queue extra chrome. |
| `session-api` quiet RunSteps | skip per-op C; one `"run-steps"` C (good). Fallback `renderTree(..., true)` if `commitLayout` missing. |
| DnD | M in `_executeDropOperation`; C is grab-end `"grab-op-end"` (~L2057) — formula OK, owner is gesture. |
| `window.js` sensors | many `renderTree(from)` still (workspace, destroy, wm-class). Host/recovery — 03/05 notes. |

#### Drop

| Catalog | Named | Twin |
| --- | --- | --- |
| Would drop change tree? | `dropChangesStructure` | `_isNoOpDrop` (~L1496) is a one-line wrapper — OK |
| Execute tile drop | `moveWindowToPointer` → intent + merge/split | execute body is a **flag machine**, not merge/split only |
| Empty-mon drop | `resolveEmptyMonitorDrop` + `_commitEmptyMonitorDrop` | `session-api._dndEmptyMonDropOp` calls the same commit (good) |
| Five-zone hit | `buildDropZones` / `hitTestDropZone` | no edge-band twin found in `lib/` |

#### TILE-anywhere / hard-ready

| Catalog | Named | Twin |
| --- | --- | --- |
| Hard-ready | in-slot `windowIsSettled` + slot bag (`layout-apply-settle.js` ~L103) | ApplyLayout `hardReadyStatus` passes `slots` (good) |
| TILE-anywhere | forbidden as layout success | `cli/launch-lib.mjs` `windowIsSettled` ~L715: TILE + rect + mon — **no parent/slot**. Allowed for launch wait; **do not import into layout**. |
| unit test | `layout-apply-settle.test.js` ~L125 `windowIsSettled(tileWin(13)) === true` | documents TILE-anywhere when slots omitted |

#### Move / swap (the three Moves)

| Surface | Symbol | Semantics | Mark 2 name |
| --- | --- | --- | --- |
| Keybind | `tree.move(node, direction)` `tree.js` ~L1855 | walk tree in a Meta direction; sibling swap or reparent; edge wraps **own** monitor | closest to **Move** + sometimes swap |
| DBus / RunSteps | `_moveOp` ~L2819 | dest WINDOW = insert after; dest CON/MONITOR = append/`position:start` | **not** directional Move; ad-hoc reparent |
| DnD | `_executeDropOperation` | zone → wrap / insert / join / swap / empty-mon | **Join** (CENTER) + **Move** (edge) + wrap |
| Keybind swap | `tree.swap` / `swapSibling` / `swapPairs` | directional or cyclic | swap is not a Mark 2 top-level op (Join/Move cover it) |
| DBus Swap | `_swapOp` → `swapPairs` | two selectors | same TreeOp, different surface |

#### Control-plane twins

| Job | Plane A | Plane B | Plane C |
| --- | --- | --- | --- |
| Focus | `command.js` Focus → `tree.focus` + `afterFocus` | DBus Focus → `revealGroupChild` | RunSteps `focus` → same `_focusOp` |
| Layout mode | keybind toggle `setLayout` | RunSteps `_layoutOp` (lift nested) | ApplyLayout `_setLayoutStructureOp` (lift/refuse, no peel) |
| Group | `WindowMergeGroup` | RunSteps `group`/`merge-group` | DnD CENTER |
| DnD | live grab `moveWindowToPointer` | RunSteps `dnd-drop` synthesizes GRAB_TILE + `_executeDropOperation` | — |
| Open | map path `_planOpenAppPlacement` | `PlaceNext` hint | ApplyLayout open-into-slot (epoch) |
| Layout apply | DBus `ApplyLayout` | leftover `LayoutBatch` | Python `scripts/forge/layout_*.py` still plans for CLI |

#### Logger / planner leftovers

| Catalog | Named | Twin |
| --- | --- | --- |
| Logging | `plog-adapter.js` | `logger.js` is a shim (OK). Do not add a third. |
| Reconcile plan | `lib/shared/layout-plan.js` `planReconcile` | `scripts/forge/layout_plan.py` still used by leftover Python `layout` CLI. Catalog: do not port Python planner into `cli/`. |

---

### Import recommendation

| Object | Rec | Why |
| --- | --- | --- |
| `keybindings.js` | **reshape** | Keep as accelerator table. Payload becomes OpSet names, not Forge `action.name`. |
| `command.js` | **reshape** | Thin: resolve focus unit → OpSet. Delete LTF field writes; delete snap as fake tiling. |
| `drop-zones.js` | **keep** | Gesture math. Presenter may consume paint rects. |
| `drop-intent.js` | **keep** | Overflow + “would change” belong next to OpSet preflight, not in DnD class. |
| `drag-drop.js` gesture / tab chrome | **keep** | Pointer, peel, chip, preview actors = Surfaces + Presenter. |
| `drag-drop.js` `_executeDropOperation` / empty-mon commit | **discard** as mutator | Translate zone → Mark 2 Join/Move/wrap; TreeOps only. DnD is **not** a second OpSet. |
| `run-steps.js` | **port** | Keep freeze-batch idea; rename ops to OpSet; one dispatcher for keybind/DBus/apply. |
| `session-api.js` public DBus | **keep** (stable) / **park** (legacy) | See table below. |
| `session-api.js` `_moveOp` / `_layoutOp` lift / `_skeletonOp` field writes | **reshape** | Cores should call OpSet/TreeOps, not splice. |
| `tile-select.js` / `tree-query.js` | **keep** | Observe grammar. |
| `lft-mru.js` / `open-min-place.js` | **port** as product policy | Not TOM. Open-app / overflow are Surfaces + OpSet Launch/Join. |
| `lib/shared/layout-plan.js` | **keep** | Product data IR. |
| `lib/shared` gi modules (`settings.js`, `theme.js`, `config-sync.js`, `forge-config-home.js`) | **keep** as Host/product | Not kernel. |
| `lib/shared` pures (keys, kits, conflicts, overrides, rival-tilers, min-tile, paths, layout-open) | **keep** | CLI/prefs share. Still not TOM. |
| `lib/prefs/` | **keep** | GTK surface. |
| `cli/forge.mjs` + `dbus.mjs` | **keep** | Thin. |
| Python leftover `layout` / `layout_plan.py` | **park** | Product apply is DBus ApplyLayout; planner already JS. CN14/CN15. |
| `LayoutBatch` | **park** / **discard** as product entry | ApplyLayout owns reconcile. Chrome-show may fold into apply bag. |

**Stable DBus to import** (product surfaces):

- `Ping`, `GetTree`, `Focus`, `Swap`, `Move`, `PlaceNext`
- `GetSetting`, `SetSetting`, `SettingsSave`, `SettingsLoad`
- `RunSteps` (batch; later OpSet JSON)
- `ApplyLayout`, `GetLayoutApply`, `CancelLayoutApply` + progress/done
- `Log`

**Internal / accident** (do not grow; fold or hide):

- `LayoutBatch` (pre-ApplyLayout multi-open)
- `GetThrashCatalog` (hunt)
- `SaveSessionLayout` (install/HUP — keep as ops tool, not user tiling)
- RunSteps `dnd-drop`, `skeleton`, `bind` (test/apply internals on the
  same bus as user Focus)
- `_moveOp` dest-append semantics (scripting convenience, not Mark 2)

CLI PATH (`cli/forge.mjs` `NODE_COMMANDS`): ping, tree, focus, swap,
move, get, set, settings, log, launch, run, run-steps, keybind.
Leftover Python: `layout`, install/update/uninstall, `jobs`, `thrash`,
`save-session-layout`, `help`.

---

### Entry points for later agents

If you need X, open Y, call Z:

- Keybind → `keybindings.js` `_bindings` → `wm.command` →
  `command.js` `_handlers[name]`.
- Live DnD → grab in `window.js` / `drag-drop.js` →
  `moveWindowToPointer` → `drop-intent` + `_executeDropOperation`.
- Tab chrome drag → `armTabDrag` / `finishTabDragRelease` → reorder
  `_commitTabStripReorder` or peel `_startTabMoveGrab`.
- DBus one-shot → `SessionApi.Focus|Swap|Move|…` → `_focusOp` etc.
- Batch → `RunSteps` → `run-steps.js` dispatch → `_runStepHandlers`.
- `forge layout` → CLI Python leftover → DBus `ApplyLayout` →
  `LayoutApplyRunBag` → `_runApplyLayoutSteps` (handlers with
  `layout` override).
- Selectors → `tile-select.js`. Forest JSON → `tree-query.js`.
- New window → `_planOpenAppPlacement` → `resolveOpenAppPlacement`;
  mins → `resolveOpenMinPlacement`.
- Prefs → `prefs.js` pages; keys in `settings-keys.js`.
- CLI → `cli/forge.mjs` then `cli/<cmd>.mjs` then `cli/dbus.mjs`.

---

### Open questions

1. **One Move?** Collapse keybind `tree.move(direction)`, DBus dest
   reparent, and DnD zone execute into Mark 2 Move + Join + wrap, with
   dest-append as a Surface sugar? Blocks layer assignment for
   `_moveOp`.
2. **RunSteps vs ApplyLayout vs command** — keep three *callers* of
   one OpSet dispatcher, or keep ApplyLayout as a private epoch
   engine that must not share `_layoutOp`? (Today they share handlers
   except layout.)
3. **Should `dnd-drop` stay on the bus?** It exists to simulate grab
   without pointer. Test surface vs product OpSet.
4. **Open-app** — Launch OpSet vs Host admit + policy pures? Placement
   is not TOM; attach still splices in WM.
5. **`LayoutBatch` chrome-show** — fold into ApplyLayout overlay
   (D043) and unexport, or keep for no-open apply?
6. **`setLayout` vs TreeOps field writes** in `tree.split` /
   `cleanTree` — kernel allowed, or even TreeOps must use I1?

---

### Do-not-rescan traps

- `Node` **still has** `set childNodes` (`tree.js` ~L218) and
  `set parentNode` (~L287). Product `lib/` does not assign
  `childNodes =`; tests do.
- **Three Moves:** keybind directional `tree.move` ≠ DBus
  `_moveOp(dest)` ≠ DnD `_executeDropOperation`. None is Mark 2 Move.
- ApplyLayout is **not** a fourth dispatcher: it calls
  `runStepsDispatch` with `layout` rebound to
  `_setLayoutStructureOp` (`session-api.js` ~L1464).
- `lib/shared/` is the **CLI/prefs/policy** share, **not the TOM**.
  Tree lives in `lib/extension/tree.js`. Pures: `layout-plan.js`,
  `layout-open.js`, keys/kits/conflicts. gi: `settings.js`,
  `theme.js`, `config-sync.js`, `forge-config-home.js`.
- `session-api.js` ~4950 lines: group by DBus name (XML ~L91) then
  `_runStepHandlers` (~L2566). Do not linear-read.
- Live LTF writes outside reveal/`setOpenLeaf` are the twins list
  above — do not re-grep tests.
- TILE-anywhere for **layout** is dead on the ApplyLayout slot path;
  it is **alive** in `cli/launch-lib.mjs` `windowIsSettled` and in
  unit tests that omit `slots`.
- Python `scripts/forge/forge` still implements ping/tree/focus/…
  (`cmd_ping` ~L369). PATH `forge` is Node; leftover spawn is
  `layout`/install/jobs. Direct Python is a ghost twin.
- `LayoutBatch` is still on the bus. Product reconcile is
  `ApplyLayout`.
)
