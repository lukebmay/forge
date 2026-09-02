# Exploration — WindowManager + event hub

**As of:** 2026-08-27
**Domain:** window-wm
**Audience:** P0b `layers.md` / `import-map.md` (do not rescan `window.js`)

## Scope

Opened:

- `lib/extension/window.js` (`WindowManager`, 215–7459; ~283 methods)
- `lib/extension/command.js` (`CommandHandler`, 33–745)
- `lib/extension/focus.js` (`FocusManager`, 48–462)
- `lib/extension/action-pipeline.js` (afterFocus / commitLayout /
  settleTabFocus / revealGroupChild)
- `lib/extension/layout-controller.js` (`LayoutController`)
- Lifecycle bags: `sources.js`, `signals.js`, `lifetime.js`,
  `window-attach.js`, `suppress.js`, plus L8/L11
  `open-commit-manager.js`, `layout-batch-depth.js`
- `lib/extension/workspace.js`, `monitor.js`
- `extension.js` enable/disable + session-mode wiring only
- `docs/dev/architecture.md` subsystems + layout loop
- `docs/dev/contracts.md` job catalog
- `agents/plans/forge-lifecycle-abstractions.md` (L1–L6, W1–W5)

Did **not** dump `window.js`. Did **not** walk `tree.js` Node internals
(that is `02-forge-tree.md`), DnD execute (`06-surfaces-twins.md`), or
ApplyLayout slot machines (`05-apply-recovery.md`) beyond WM hooks.

Grep: `^  [_a-zA-Z].*\(` on `window.js` (283 methods). Delegation
`return this.(sessionLayoutRestore|monitorRecovery|decorationManager|focusManager|dragDrop)`.

## Current objects (as the code is)

| Name | File:symbol | What it does today |
| --- | --- | --- |
| **WindowManager** | `window.js:WindowManager` (GObject, 206–7459) | Event hub **and** policy **and** paint scheduler. Constructs Tree + ~12 managers. Owns flags (`_freezeRender`, grabOp, `_sessionLocked`, `_layoutBindPending`, LFT, PlaceNext queue, dock hook). ~half the methods are thin spies-preserving wrappers. |
| **Tree** | `tree.js:Tree` (owned as `wm._tree`) | TOM + TreeOps + `processNode`/`apply` presenter. WM calls `tree.render` from `renderTree`. |
| **CommandHandler** | `command.js:CommandHandler` | Named-action switch (Move/Focus/Split/… → `tree.*` + `wm.commitLayout`). Proto-OpSet, still GObject, still Meta raise/activate. |
| **FocusManager** | `focus.js:FocusManager` | Pointer warp, hover loop, `setOpenLeaf` / tab+stack restack, `reassertAllTabStackSlots`, unfocus. Lives via `wm` spies. |
| **action-pipeline** | `action-pipeline.js` | Canonical FocusChanged / StructureChanged composers. WM methods are one-liners. |
| **LayoutController** | `layout-controller.js:LayoutController` | Debounced `requestLayout` → `wm.renderTree`; `requestVerify` **sensor only**. Own timers, not `_wmSources`. |
| **SourceBag** | `sources.js` | WM-global named timers (`_wmSources`, W1). `cancelAll` on disable; bag **not** disposed (re-enable). |
| **SignalBag** | `signals.js` | WM-global display/wm/wsm/settings/overview (`_wmSignals`, W5). `disconnectAll` on disable. |
| **Lifetime** | `lifetime.js` | Compose signals→sources dispose. **Not** used as the WM object. Used only inside `WindowAttach`. |
| **WindowAttach** | `window-attach.js` | Per-window Lifetime registry. **Live slot:** `"stack"` (W2). Per-window `windowSignals`/`actorSignals` are **not** here. |
| **SuppressFlag** | `suppress.js` | Nestable geom / above / rehome (W4). |
| **OpenCommitManager** | `open-commit-manager.js` | Per-window quiet timers. Fire callback stays on WM `_fireOpenCommit`. |
| **LayoutBatchDepth** | `layout-batch-depth.js` | Pure depth + latch. Chrome / commit / epoch stay on WM. |
| **WorkspaceManager** | `workspace.js` | WS nodes + St.Bin scaffold + `window-added` debounce + index renumber. Own `Map` of signal ids — **not** SignalBag. |
| **MonitorManager** | `monitor.js` | MONITOR nodes per WS, layout from geometry, `collectLiveMonitorsInfo`. Host adapter + tree mutate + St.Bin. |
| **SessionLayoutRestoreManager** | `session-layout-restore.js` | Save/restore/shield. WM holds flags; methods are thin wrappers. |
| **MonitorRecoveryManager** | `monitor-recovery.js` | H1 workareas settle. WM still owns `_onWorkareasChanged` branch. |
| **DecorationManager** | `decoration.js` | Borders / tab chrome. WM forwards hide/show/update. |
| **DragDropManager** | `drag-drop.js` | Grab begin/end, drop execute, tab drag. Grab **resize percents** still on WM. |
| **LayoutApplyChrome** | `layout-apply-chrome.js` | CL10 dim/spinner. WM `show`/`clear`. |
| **LftMru** | `lft-mru.js` | TILE last-focused-tile rings + `resolveOpenAppPlacement`. |
| **place-hint / open-min** | `place-hint.js`, `open-min-place.js` | Pure PlaceNext + overflow-min policy. WM still sequences insert. |
| **ForgeExtension** | `extension.js` | Constructs Config → theme → **WM** → Keybindings → Cheatsheet; `extWm.enable()`. Disable: sessionApi → `extWm.disable()` → keybindings. Lock: tree stays; `onSessionLocked` / `onSessionUnlocked`. |

## WindowManager methods by domain

Line ranges are the method start (class body 215–7459). Wrappers that
only `return this.<mgr>.…` are marked **delegate**.

### Enable / disable / bags (Host lifecycle)

| Method | Lines | Notes |
| --- | --- | --- |
| `constructor` | 215–343 | Builds Tree + bags + managers. Pointer loop if hover-on. |
| `enable` | 1432–1445 | Bind signals, dock hook, monitor map, seed mins, `reloadTree("enable")`. |
| `disable` | 1373–1430 | **Checklist** (see below). Not `Lifetime.dispose()`. |
| `_bindSignals` | 501–742 | Display/wm/wsm/settings/overview via `_wmSignals`. |
| `_removeSignals` | 2094–2155 | `disconnectAll` + WorkspaceManager.destroy + per-window arrays + `cancelAll` + LC.cancel. |
| `queueEvent` | 474–496 | Paced drain on `_wmSources` slot `"queue"`. |
| `pointerLoopInit` | 345 | **delegate** FocusManager. |
| `_onSettingsChanged` | 6686–6763 | Prefs → render / layout-mode / hover / CSS. Surface→presenter. |
| `_syncLayoutVerifyInterval` | 1508 | CL6 periodic verify. |

### Track / map / destroy (Host + open policy)

| Method | Lines | Notes |
| --- | --- | --- |
| `trackWindow` | 3277–3587 | **God path:** place plan → open-min → slotSplit → `createNode` FLOAT → sticky → bind → percent → open-commit. |
| `trackCurrentWindows` | 5723–5737 | Flat re-track all tab-list windows. |
| `admitUntrackedWindows` | 5796–5827 | Census + track missing (contracts: admit). |
| `censusMetaWindows` | 5743–5790 | Live Meta vs tree. |
| `_bindWindowSignals` | 5400–5537 | **Not** WindowAttach: arrays on `meta.windowSignals` / `actor.actorSignals`. |
| `windowDestroy` | 5848–5907 | Detach, cancel open, focus-after-close, `renderTree` + queued second render. |
| `_validWindow` / `isWindowIgnored` | 5829 / 7274 | Type + ignore-override filter. |
| `_dropIfIgnored` | 7401–7438 | Twin disconnect (hand `disconnect` loop, not `disconnectSignals`). |
| `findNodeWindow` / `allNodeWindows` / getters | 1589 / 2964 / 1593–1635 | Meta ↔ node; `focusMetaWindow` = `global.display.get_focus_window()`. |
| `postProcessWindow` | 5539–5555 | Prefs window → center. |

### Render / commit / paint (Presenter, contaminated)

| Method | Lines | Notes |
| --- | --- | --- |
| `requestLayout` | 2162–2168 | Batch latch **or** LayoutController. |
| `requestVerify` | 2641 | **delegate** LC (sensor). |
| `commitLayout` | 5658–5660 | **delegate** pipeline: force → `renderTree(_, true)` else `requestLayout`. |
| `renderTree` | 2645–2712 | Idle `"renderTree"`: prune → D044 normalize → **processFloats** → tree.render (`processNode`+`apply`) → tab reassert → chrome → last-good. **Mutates mode + Meta homes.** |
| `freezeRender` / `unfreezeRender` | 6659–6665 | Batch/Z freeze. |
| `move` / `_moveImpl` | 1809–1970 | Presenter commit: clamp, Wayland scale, `move_resize_frame`, echo epoch. |
| `reassertNodeToSlot` / `reassertTilesByIds` | 6464 / 6490 | Paint-rect restore (zoom-aware). |
| `updateMetaPositionSize` | 6359–6438 | Attribution: forge-echo / open-quiet / grab / overflow / D026 restore / LC sensor. |
| `_tiledWindowAtTreeSlot` / `_restoreTileToSlot` | 6444 / 6558 | contracts: chrome-only vs restore. |
| `isolateThrashWindow` / `removePlaceholder` | 2208 / 2294 | AC4; pures in `layout-placeholder.js`. |
| `calculateGaps` / borders / decorations | 1745–1750, 3139–3148, 6655 | **delegate** DecorationManager. |

Paint vs mutate (Q3) — **proven**:

```text
mutate (TOM/TreeOps/OpSet/surfaces)
  → wm.commitLayout(reason, {force})
      force  → wm.renderTree(from, true)
      else   → wm.requestLayout → LC debounce → wm.renderTree
  → idle:
      pruneDeadWindows          (TOM hygiene)
      normalizeTabGroups…       (Host Meta rehome, D044)
      processFloats             (product mode TILE/FLOAT)
      tree.render:
        processNode             (compute renderRect; workarea from Meta)
        tree.apply              (wm.move → move_resize_frame)
      reassertAllTabStackSlots  (presenter heal)
      updateDecoration/Borders  (chrome)
```

`tree.apply` (`tree.js` ~3181) is the Meta writer. It is **not** a TOM
mutate. `renderTree` is **not** a pure presenter: it also classifies
floats and rehomes groups.

### Grab / resize (Surface + I3 policy still on WM)

| Method | Lines | Notes |
| --- | --- | --- |
| `_handleGrabOpBegin/End`, `_grabCleanup`, `moveWindowToPointer`, drop helpers | 6814–7013, 7143 | **delegate** DragDropManager. |
| `_clearGrabOnUnmanaged` | 6988 | WM still owns `_draggedNodeWindow` / `grabOp`. |
| `resize` / `expand` / `shrink` | 1174 / 1241 / 1254 | Keybind size. |
| `applyOwningSplit` / `_adjustOwningSplitPercents` / `_handleResizing` | 1266–1309, 7040–7099 | I3 percent math **inlined on WM**. |
| `applyGoldenRatio` | 1326 | Same cluster. |

### Float / overrides (Product data + Host)

| Method | Lines | Notes |
| --- | --- | --- |
| `processFloats` / `_processFloatDecision` | 2714–2856 | Every render. Uses `lib/shared/float-reason.js`. |
| `_ensureTiledForSlotPlace` | 2769 | Late PlaceNext TILE (no LFT adopt). |
| `isFloatingExempt` / overrides | 355–460, 7151–7356 | windows.json + type + max/fs. |
| `toggleFloatingMode` | 440 | Command path. |
| `floatWorkspace` / `unfloat*` / `floatAllWindows` | 1710–1718, 7440–7458 | |
| `_reconcileFullscreenFloatDemotion` | 1037 | Always-on-top vs Meta-fs (same mon). |
| `_handleUserAboveChange` | 2957 | User pin → `renderTree("notify-above")`. |

### Open / place (Surface + product — still sequenced on WM)

| Method | Lines | Notes |
| --- | --- | --- |
| `_planOpenAppPlacement` | 3863–3967 | PlaceNext **or** dock chain **or** `resolveOpenAppPlacement` **then** last-focused override. |
| `placeNext` / hint consume / late adopt | 3974–4417 | DBus one-shot. Pures in `place-hint.js`. |
| `_decideOpenMinPlacement` / `slotSplitForInsert` / `_adoptOpenIntoTileSlot` | 4519–5069 | D007/D013/D032/D049. Pures in `open-min-place.js`. |
| `noteDockLaunch` / `_tryInstallDockLaunchHook` | 5200 / 5318 | **Monkey-patch** `Shell.App.prototype` activate. |
| `_applyDockStickyHome` / `_enforceDockStickyIfNeeded` | 5119 / 6077 | Sticky grace vs entered-monitor. |
| `_scheduleOpenCommit` / `_fireOpenCommit` | 3714 / 3824 | Quiet math in `layout-open.js`; fire = unmaximize + `commitLayout("window-create")`. |
| `pinLayoutOpenLeaf` / restore-if-stolen | 2469–2609 | Layout residual open-leaf. |

### Rehome / monitors / workspaces (Host + Epoch)

| Method | Lines | Notes |
| --- | --- | --- |
| `_onWindowEnteredMonitor` / flush | 815–896 | Defer; skip during ApplyEpoch / grab / shield. |
| `_onWorkareasChanged` | 940–959 | Retrack **or** H1 queue. |
| `_queueMonitorRecovery*` / `_recoverAfterWorkareas` | 962–994 | **delegate** MonitorRecoveryManager. |
| `updateMetaWorkspaceMonitor` | 6016–6070 | Live (mon,ws) vs tree; dock sticky first. |
| `_rehomeWindowPreservingContainer` | 6112–6145 | Intact CON migrate **or** after dest-mon LFT. |
| `_queueWindowHomeReconcile` / `_rehomeWorkspaceWindowsBeforeRemoval` | 6233 / 6295 | GNOME insertWorkspace burst. |
| `normalizeGroupToHomeMonitor` | 3090–3133 | D044; contracts named API. |
| `rehomeIfSlotTooSmall` | 4655 | Mid-session min overflow → tab BFS else float. |
| `getMonitorLiveMap` / `_refreshMonitorIdentityMap` | 1522–1579 | `monitor-identity.js`. |
| `bindWorkspaceSignals` | 1159 | **delegate** WorkspaceManager. |
| `determineSplitLayout*` / `applyDefaultLayoutToContainer` | 1670–1697 | Monitor aspect → H/V. |

### Fullscreen / zoom / maximize (Presenter + product)

| Method | Lines | Notes |
| --- | --- | --- |
| `toggleZoom` | 1730 | D030; `zoom.js` + `commitLayout("zoom")`. |
| `handleMaximizeOnSingle` / `handleUnmaximizeForTiling` | 3220 / 3245 | Prefs-gated. |
| `_reassertZoomedTiles` | 5609 | Post-render. |

### Raise / focus (Presenter chrome + Surface)

| Method | Lines | Notes |
| --- | --- | --- |
| `afterFocus` / `settleTabFocus` / `revealGroupChild` | 5635–5676 | **delegate** action-pipeline. |
| `setOpenLeaf` / `updateTabbedFocus` / `updateStackedFocus` / `reassertAllTabStackSlots` | 5557–5575 | **delegate** FocusManager. |
| `unfocusTiles` / `exitForgeMode` | 5643–5650 | FC2. |
| `_restoreFocusAfterWindowClosed` | 5963 | `pickFocusAfterClose` (pure). |
| `_raiseAfterSessionRestore` | 3045 | **delegate** session restore. |

Contracts: raise is **multi-path on purpose** — do not invent
`raiseWindow()`.

### Apply epoch + layout batch (Epoch)

| Method | Lines | Notes |
| --- | --- | --- |
| `beginApplyEpoch` / `endApplyEpoch` / `isApplyEpochLive` | 749–774 | D039 home authority. |
| `notifyDisplaysChangedDuringApply` | 788 | Cancel apply; skip H1. |
| `beginOpenLayoutBatch` / `endOpenLayoutBatch` | 2343–2403 | Depth + chrome + force commit on end. |
| `showLayoutApplyChrome` / `clearLayoutApplyChrome` | 2410–2448 | CL10. |
| `command` | 1170 | **delegate** CommandHandler. |
| Session save/restore wrappers | 906–930, 2998–3054 | **delegate** SessionLayoutRestoreManager. |
| `reloadTree` | 2975–2995 | Snapshot → wipe → retrack → restore → admit → render. |

### CommandHandler actions (proto-OpSet)

`command.js` `_handlers` (~162–741): Float\*Toggle, Move, Focus,
FocusParent/Child, WindowMoveIn/Out, Swap, Split, LayoutToggle,
\*ModeToggle, GapSize, WindowResetSizes, WorkspaceActiveTileToggle,
LayoutStacked/Tabbed/StackTabToggle, WindowMergeGroup, WindowUngroup,
Prefs/Config, MovePointerToFocus, Zoom\*, WindowSwapLastActive,
SnapLayoutMove, ShowTabDecorationToggle, WindowResize\*, Expand/Shrink,
GoldenRatio.

Move calls `wm.tree.move` then **one** `commitLayout("move-window",
{force:true})` then queued `settleTabFocus` (not a second render).
Focus calls `wm.tree.focus` then `afterFocus` (no `renderTree("focus")`).

## Intended layer vs actual layer

Use target names from `00-scheme.md` even though the code has no Host
class.

| Object | Intended | Actual | Contamination |
| --- | --- | --- | --- |
| WindowManager | **Host** (thin) + dispatcher | Host + Presenter + Epoch + Surfaces + OpSet + product | Policy + paint + Meta + prefs in one GObject |
| CommandHandler | **OpSet** / Surface | Surface calling TreeOps + Presenter | Meta `raise`/`activate`; GObject; float toggle also `wm.move` |
| FocusManager | Presenter chrome + Host pointer | Mixed | Writes `lastTabFocus` (TOM); `reassertAllTabStackSlots` (presenter); hover focuses Meta |
| action-pipeline | Presenter stages | Correct **composer**; still invokes WM god methods | Fine as import — keep |
| LayoutController | Presenter scheduler + sensor | Matches intended | Duplicate batch-depth check vs WM `requestLayout` |
| SourceBag / SignalBag | Host | Host (wired) | WM does not compose them in Lifetime |
| Lifetime | Host dispose | Only per-window stack pin | disable() still a checklist |
| WindowAttach | Host per-window | Partial (stack only) | `windowSignals` still on Meta |
| WorkspaceManager | Host adapter | Host + TOM mutate + St.Bin + own signal Map | Scaffold paint in adapter |
| MonitorManager | Host adapter | Same | `determineSplitLayout` is product/OpSet default |
| SessionLayoutRestore / MonitorRecovery | **Epochs** | Epochs, but flags + wrappers on WM | Keep strategies |
| DragDropManager | **Surface** | Surface; grab flags on WM | Resize percents still WM |
| processFloats / trackWindow / open-min | Product + OpSet Launch | Inlined on WM | Cannot be a Host adapter |
| `tree.apply` / `wm.move` | **Presenter** | Presenter | Called from render **and** reassert **and** command float |
| `tree.processNode` | Presenter compute (slots) | Presenter, but uses Meta workarea | See `04-presenter.md` |

**Q1 — domains on WM that should be Host vs Presenter vs Surface vs
Epoch vs OpSet (proven):**

| Layer | Today on WM | Should move to |
| --- | --- | --- |
| **Host** | `_bindSignals`, Meta↔id, `move_resize_frame`, workareas/monitors/ws, bags, `_validWindow`, dock hook, census | Keep as Host |
| **Presenter** | `renderTree` body, `move`, reassert, chrome, zoom paint, borders | Presenter; **strip** processFloats/normalize from the paint idle |
| **OpSet** | `CommandHandler` + I3 owning-split + split/group/ungroup callers | Mark 2 OpSet; Forge chords as a Surface on that OpSet |
| **Epochs** | ApplyEpoch, session restore, H1, LayoutBatch | Epochs (already mostly extracted) |
| **Surfaces** | keybinds, DnD, PlaceNext, settings-changed, dock note | Surfaces → OpSet/epoch |
| **Product data** | windows.json overrides, skip-tile lists, mins.json, thrash catalog | Stay product; Host only **reads** |

## Strengths (keep)

- **action-pipeline is the real Focus/Structure contract.** `afterFocus`
  / `commitLayout` / `settleTabFocus` / `revealGroupChild` are named
  and used by command + Meta-focus. Do not invent `renderTree("focus")`.
- **LayoutController verify is sensor-only (AC1).** Mismatch does not
  reassert. Keep.
- **Lifecycle bags work for what they own.** W1 named slots cannot wedge
  (Bug #531); W4 suppress is throw-safe; L8 open-commit cancelAll is
  real; L11 batch depth is a pure state machine.
- **Open placement is already factored as pures:**
  `resolveOpenAppPlacement`, `resolveOpenMinPlacement`, PlaceNext matchers.
  The **sequence** is still WM; the **formulas** are importable.
- **H1 and session restore are already managers** with spy wrappers —
  import as Epochs, do not rewrite the dual monitor-resolve.
- **CommandHandler already speaks TreeOps names** (`tree.move` /
  `moveIn`/`moveOut`/`group`/`ungroup`/`setLayout`) + one `commitLayout`.
  Good Surface→OpSet shape.
- **Float reason is shared** (`lib/shared/float-reason.js`) — product
  data, not a second brain.
- **Raise is multi-path on purpose** (contracts). Keep as several
  presenter calls, not one mega-raise.
- **Spy-preserving delegates** (`return this.focusManager.…`) are a
  proven extract pattern. New Host can keep a façade if tests need it.

## Weaknesses / duck-tape

| Failure class | Symptom in code | Why the abstraction is wrong |
| --- | --- | --- |
| **God hub** | 7.5k WM still sequences open, float, paint, rehome, grab-resize, prefs | Lifecycle extracts removed **leaks**, not **domains**. The center of gravity is still WM. |
| **Paint mutates** | `renderTree` idle: `processFloats` + D044 normalize + `tree.apply` | Presenter must not classify TILE/FLOAT or reparent. Mode policy in the paint tick is why “one render” has side effects. |
| **Host is not Host** | `trackWindow` (~310 lines) is Launch OpSet + product + Meta bind | A Host adapter maps Meta→WINDOW id. Insert topology is OpSet Launch. |
| **Lifetime not the WM** | `disable()` is 15+ steps; Lifetime unused at WM scope | Bags own timers/signals they were given. They cannot know St.Bin borders, dock prototype, class-min persist, tree.destroy. |
| **Per-window signals leftover** | `_bindWindowSignals` arrays on Meta; optional L4 not wired | Two disconnect worlds (`disconnectSignals` vs `_dropIfIgnored` raw loop). |
| **WorkspaceManager not SignalBag** | `_workspaceSignals` Map + object-anchored disconnect | Host adapter with a private lifecycle dialect. |
| **I3 percents on WM** | `_handleResizing` / `applyOwningSplit` | Size policy is TreeOps/OpSet; grab is Surface. WM still does both. |
| **Dock monkey-patch** | `Shell.App.prototype._forgeDockWm = this` (`_tryInstallDockLaunchHook` ~5318) | Host launch observation via prototype wrap; disable must null the pointer. Fragile Host. |
| **Duplicate batch gates** | WM `requestLayout` checks `_layoutBatch.active`; LC fire checks `_openLayoutBatchDepth` | Two writers of the same latch (compat getters on WM). |
| **GObject WM** | `extends GObject.Object` for no signals of its own | Host need not be GObject; contamination of “everything is a GObject manager.” |

**Q2 — after lifecycle extracts, what still cannot be a clean Host
adapter?** Policy still in WM (**proven**):

- `trackWindow` / `_planOpenAppPlacement` / open-min / slotSplit
- `processFloats` + override matching
- `updateMetaPositionSize` (D026 + overflow + grab resize)
- `renderTree` orchestration
- `normalizeGroupToHomeMonitor` / `_rehomeWindowPreservingContainer`
- owning-split / golden-ratio
- `_onSettingsChanged` layout-mode toggles (OpSet)
- fullscreen float demotion

Bags made disable **safer**. They did not make WM a Host.

## Twins / bypasses

Catalog: `docs/dev/contracts.md`. Named API vs hand-roll:

| Job | Canonical | Twin still in WM/command |
| --- | --- | --- |
| Keyboard / tab / Meta focus | `wm.afterFocus` | **No** `renderTree("focus")` in extension (good). Meta-focus queues afterFocus. |
| Commit structure/size | `wm.commitLayout` | `windowDestroy` still `renderTree("window-destroy-quick", true)` **and** queued second `renderTree`. `_handleUserAboveChange` → `renderTree("notify-above")` not commitLayout. |
| Show tab/stack child | `wm.revealGroupChild` | `pinLayoutOpenLeaf` fallback `parentCon.lastTabFocus = meta` if no node (~2480). `_ensureTabbedForOpen` writes `tabCon.lastTabFocus` (~4845) after `tree.split` (should be `setOpenLeaf` / group). Command Move writes `prev.parentNode.lastTabFocus` (~command.js:206) **and** later `settleTabFocus`. |
| Group two windows | `tree.group` | Open path `_ensureTabbedForOpen` uses `tree.split` then assigns `layout = TABBED` (Launch, not DnD — say so; still a layout-assign twin of `setLayout`). |
| Slot-split for insert | `wm.slotSplitForInsert` | Used. Good. |
| New-window home | `resolveOpenAppPlacement` + `wm._planOpenAppPlacement` | WM **then** overrides with focused tile unless dock/empty-head (~3948). Formula split across pure + WM. |
| Open-min overflow | `resolveOpenMinPlacement` via `_decideOpenMinPlacement` | Used on track + rehome-after-LFT. |
| Restore TILE to paint | `wm.reassertNodeToSlot` | Used from pipeline + D026. |
| Per-window disconnect | `disconnectSignals` / SignalBag | `_dropIfIgnored` raw `metaWindow.disconnect` loop (~7421). `_bindWindowSignals` not in WindowAttach. |
| Child list | Node APIs | Open/rehome use `appendChild`/`insertBefore` (good). |

**Q6:** twins that contracts already named and are **still inlined**
are the lastTabFocus assigns, destroy’s double renderTree, ignore-drop
disconnect, and Launch `split`+`layout=` instead of `group`/`setLayout`.

## Import recommendation

**WindowManager: `reshape`.** Do not pare 7.5k lines in place into TOM.
New Host is a thin Mutter adapter; WM strategies **port** onto
TOM + OpSet + Presenter + Epochs.

| Object | Rec | Why |
| --- | --- | --- |
| WindowManager (god object) | **reshape** | Split into Host + dispatcher; do not line-edit into purity. |
| action-pipeline | **keep** | Already the Focus/Structure presenter stages. |
| LayoutController + sensor verify | **keep** | Control loop; Presenter scheduler. |
| SourceBag / SignalBag / SuppressFlag | **keep** | Host primitives. |
| Lifetime | **keep** | Compose Host dispose; **wire at Host scope** (today unused there). |
| WindowAttach | **port** | Finish per-window signals (lifecycle optional leftover). |
| OpenCommitManager + layout-open.js | **keep** | Interactive open quiet (not ApplyLayout). |
| LayoutBatchDepth | **keep** | Epoch/CLI batch; side effects stay caller. |
| CommandHandler | **reshape** → OpSet Surface | Keep action names as chords; body becomes OpSet + `commitLayout`. |
| FocusManager | **reshape** | Pointer/hover → Host; LTF/open-leaf → TOM+Presenter; slot reassert → Presenter. |
| WorkspaceManager / MonitorManager | **reshape** | Host: list ws/mon, signals, geometry. Drop St.Bin + `createNode` (TOM/Presenter). |
| SessionLayoutRestore / MonitorRecovery (H1) | **keep** as Epochs | Dual monitor-resolve stays. |
| LFT + PlaceNext + open-min pures | **keep** | Launch placement strategies. |
| processFloats / float-reason | **keep** (product) | Host supplies flags; policy stays shared. |
| DragDropManager | **port** (see 06) | Surface; grab flags leave WM. |
| Dock `Shell.App` wrap | **park** / Host hook | Need a Host launch observer that is not a prototype patch. |
| `queueEvent` 220ms drain | **port** | Host paced queue; policy must not live in the delay. |
| GObject on WM/Command/Focus | **discard** | No signals on these classes. |

**Strategies to keep when reshaping WM into Host:**

1. Open-app home: PlaceNext → dock sticky → empty-head → window-actual →
   LFT → last-focused (same-mon); then open-min tab BFS else float.
2. Interactive open quiet (`OpenCommitManager`) vs ApplyLayout epochs
   (two brains **on purpose**).
3. D026 paint-target restore + overflow rehome (not restore-to-illegal).
4. D044 group home monitor (no auto-peel).
5. H1 dual monitor-resolve + session-layout shield.
6. ApplyEpoch as sole desired-forest writer while live.
7. AC4 placeholder isolate.
8. I3 owning-split (grab + expand/shrink + golden).
9. action-pipeline FocusChanged / StructureChanged formulas.
10. Raise multi-path; open leaf ≠ keyboard focus.

**Q7 — could WM become a thin Host + Surface dispatcher if
TOM+OpSet+Presenter existed?** **Yes — that is the meeting lock.**
Not by extracting more managers that still call `this.extWm`. Host
would: bind Mutter, map Meta↔WINDOW, expose workarea/mon/ws, `move`
as presenter primitive, bags dispose. Surfaces (keybind, DnD,
PlaceNext, dock) emit OpSet/epoch. Presenter owns `processNode`+`apply`
+ chrome. **Guess:** a façade named `WindowManager` may remain for
GJS spies/tests; it must not own policy.

## Entry points for later agents

- Enable path: `extension.js` construct WM → `extWm.enable()` →
  `_bindSignals` + `reloadTree("enable")`.
- Disable: `extension.js` `extWm.disable()` — see checklist below.
- User chord: `keybindings.js` → `wm.command` → `CommandHandler.execute`.
- New window: display `window-created` → `trackWindow` →
  `_planOpenAppPlacement` → insert → `_scheduleOpenCommit` →
  `commitLayout("window-create")`.
- Paint: `commitLayout` / `requestLayout` / `renderTree` → `tree.render`
  → `tree.apply` → `wm.move`.
- Focus: Meta `focus` → queued `afterFocus({source:"meta-focus"})`.
- Geom: `position-changed`/`size-changed` → `updateMetaPositionSize`.
- ApplyLayout: `beginApplyEpoch` (session-api) — not this note.
- Host adapters: `tree.workspaceManager` / `tree.monitorManager`
  (on Tree, not WM).
- Canonical names: `docs/dev/contracts.md`; stage formulas:
  `docs/dev/actions.md`.

## Open questions

1. **Host façade:** keep a GJS `WindowManager` name for spies, or
   rename to `ForgeHost` and update tests in the same slice?
   (Does not block layer names.)
2. **`tree.processNode` Meta workarea:** is slot compute Presenter
   (needs Host workarea function) or TOM layout? Assign in
   `04-presenter.md` / `02-forge-tree.md`.
3. **Launch vs `tree.group`:** should `_ensureTabbedForOpen` call
   `tree.group`/`setLayout` (contracts) or stay a Launch-only wrap?
   Blocks OpSet vs “open policy” ownership.
4. **Dock prototype wrap:** acceptable Host, or must a Shell-supported
   launch signal exist before import? Park until Host design.
5. **`windowDestroy` double renderTree:** convert to one
   `commitLayout` when Presenter exists, or keep Cf+queued because
   prune/focus-restore needs two ticks? Product, not layer name.

## Do-not-rescan traps

- **`wm.tree` getter rebuilds Tree if `_tree` is null** (~1597).
  disable() nulls `_tree`; a stray getter after disable constructs
  a zombie Tree.
- **Lifetime is not WM.dispose.** Only WindowAttach stack-pin. disable()
  is still a hand list (decorations, chrome, open-commit, deferred
  opens, batch reset, LC.cancel, `_removeSignals`, session save,
  demoted floats, drag preview, grab cleanup, WindowAttach.disposeAll,
  transient above, `tree.destroy`, dock pointer, `disabled=true`).
- **Per-window signals are not in WindowAttach.** Arrays on Meta/actor.
  `_removeSignals` unions tab-list **and** tree WINDOW nodes (dialogs
  missing from `windowsAllWorkspaces`).
- **WorkspaceManager signals are a third dialect** (index Map + stored
  workspace object). Reorder: `destroy()` then `reloadTree`.
- **`renderTree` mutates.** Reading it as “paint only” will miss
  processFloats + D044.
- **`tree.apply` calls `wm.move`**, which starts layout echo epochs.
  Nested suppress: apply enters `_suppressGeom/_suppressRehome`; move
  also `_suppressGeom.run`.
- **Open path order is load-bearing:** PlaceNext > dock same-mon
  (focus → LFT(m) → end-of-tree) > `resolveOpenAppPlacement` > focused
  tile override (never rehomes dock/empty-head). Open-min after attach
  plan. LayoutBatch maps stay FLOAT+hidden (`layout-deferred-open.js`).
- **Dock hook is process-global.** `_forgeDockLaunchHooked` stays on
  prototype; only `_forgeDockWm` is cleared on disable.
- **CommandHandler is not Mark 2.** Action names are Forge chords
  (`WindowMoveIn`, `LayoutStackedToggle`). Glossary stays Mark 2.
- **Spy wrappers are intentional.** Deleting
  `wm.updateTabbedFocus = () => this.focusManager…` breaks tests that
  stub WM.
- **`queueEvent` default 220ms** is not open-quiet and not ApplyLayout
  settle. Third delay class.
- **`_openCommitPending` is a getter** onto `OpenCommitManager._pending`
  (tests).
- **CL5 batch:** WM `requestLayout` latches; LC `_defaultLayoutFire`
  also refuses mid-batch. `endOpenLayoutBatch` **always force-paints**
  after deferred release (R024).
- **Lock screen:** extension stays enabled; keybindings off;
  `onSessionLocked` shields H1. Tree is not serialized for lock.

## Focus answers (short)

1. **Domains:** Host = signals/Meta map/move/bags; Presenter =
   slots+apply+chrome; OpSet = command + I3 + Launch insert; Epochs =
   apply/H1/session/batch; Surfaces = keybind/DnD/PlaceNext/dock/prefs.
2. **Not Host:** trackWindow, processFloats, D026/overflow, render
   orchestration, D044/rehome, owning-split, layout-mode toggles.
3. **Paint vs mutate:** `commitLayout` schedules; `tree.processNode`
   computes; `tree.apply`/`wm.move` paints; `renderTree` also mutates
   floats/homes.
4. **Open-app:** pures in `lft-mru.js` / `place-hint.js` /
   `open-min-place.js`; **sequence + dock sticky + last-focused
   override** still WM `trackWindow` / `_planOpenAppPlacement`.
5. **disable():** Lifetime is **not** enough. Still a checklist
   (product teardown + three signal dialects + prototype hook).
6. **Twins:** lastTabFocus assigns, destroy double-render, ignore
   disconnect, Launch split+layout vs `group`/`setLayout`.
7. **Thin Host:** yes, if TOM+OpSet+Presenter exist — **reshape**,
   import the strategies in the keep list, do not carve `window.js`
   until it becomes TOM.
)