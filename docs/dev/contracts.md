# Canonical contracts (use these APIs)

Agent-facing catalog of **the** internal APIs for a job. If a job is listed
here, **do not** hand-roll a parallel path. If the API is missing a behavior,
**extend it first** (or add a sibling on the same module). One-off “fixes”
are how we get directional DnD no-ops and un-restored VLC geometry.

Formulas for focus/structure/open: [actions.md](actions.md).
Architecture: [architecture.md](architecture.md). Why: [DESIGN.md](../DESIGN.md).
Decisions: [DECISIONS.md](../DECISIONS.md) (D018–D019, D023–D026,
D037–D044, D046, D049).
Plan: [forge-canonical-contracts](../../agents/plans/forge-canonical-contracts.md).

---

## How to add behavior

1. Find the **job** in the table below.
2. Call that API. Convert any nearby duplicate while you are there.
3. If it cannot express the new case: extend **that** module, add a unit, then
   call it. Do not add a local helper that reimplements the same idea.
4. Skip an extension only when the job is a different domain (say so in the
   task note). Example: snapshot persist may write `lastTabFocus` as **data**
   without revealing; live “show this tab” may not.

---

## Job → API

| Job | Canonical API | Do not |
| --- | --- | --- |
| Tree child list / order | `Node.appendChild` / `insertBefore` / `removeChild` / `replaceChildren` | Assign `childNodes` or `parentNode` |
| Debug/trace assertions | `lib/shared/assert.js` (`assert` / `assertEq` / `assertNe`). Active when log-level ≥ debug **or** `!production` (dev); production info-and-below is a **noop**. Failure: plog **error** (stable code + fields) + `assertionFailed` flag — **never throw**. Flag skips further apply / DnD commit / launch insert. Enable: `make debug` / `production=false`, or gsettings `log-level` 5 (DEBUG) / 6 (TRACE). | Throw on invariant; use asserts as the only validation of bad profile/DBus input |
| **Logging sinks + levels** | Vendored plog (`third_party/pansi/`, PLOG 1.2.0) via `lib/shared/plog-adapter.js` (GJS Gio `plog.gjs.js`) / `cli/plog.mjs` (Node). **Dual sink:** independent file (`~/.local/state/forge/forge.log`, `$FORGE_LOG_FILE`, or nest sibling) = TRACE…ERROR; journal / CLI tee = **INFO/WARN/ERROR only**. Custom plog levels table mirrors prefs OFF/FATAL/ALL; gsettings `log-level` gates min. Levels: INFO = lifecycle; DEBUG = episode narrative; TRACE = hot-path ids. **D052:** `--dev` → DEBUG; enable `truncateFile:true` empties hunt file (CLI does not). | Parallel forge-only logger; TRACE/DEBUG to journal; import Node `plog.js` into GJS; CLI truncating the shared file |
| **Tab chrome layer / pickability** | `#forge-tab-chrome` host + `DecorationManager.attachTabDecoration` / `trackChrome` (idempotent WeakSet). Strips leave `window_group`; host sits above `window_group` / below `top_window_group` | Restack latch vs window actors; second `trackChrome` without WeakSet; `addChrome` on the host; borders/`rootBin` on the tab layer |
| **TABBED wrap plan (rows)** | `planTabbedWrap` / `minTabWidthFromChars` (`tree-layout.js`) via `processTabbed`; prefs `min-tab-label-chars` (default **12**), `max-tabs-per-line`, `max-tab-rows` (`0` = off / unbounded as keyed) | Hand-rolled row buckets; count-only wrap that ignores min width |
| **TABBED/STACKED strip reorder (commit)** | `applyTabStripReorder` + `parent.replaceChildren` + `wm.commitLayout("tab-strip-reorder")` + `wm.settleTabFocus` (dragged child). Arm: `armTabDrag`. Index pures: `tabStripGapFromFloatingChip` / `tabStripInsertIndex2D` / `tabStripInsertIndexFromGap` / `foreignStripInsertIndex` (`drag-drop.js`) | `createNode` / `mergeWindowsIntoGroup` for same-strip reorder; outline-on-neighbor as product UI; `replaceChildren` on every motion; assign `childNodes` |
| **Tab drag pointer events (gesture lifetime)** | `DragDropManager` only (`drag-drop.js`): stage `captured-event` + `tabDragPointer` SourceBag poll → `noteTabDragMotion` / `finishTabDragRelease`. Poll skips when xy already synced; after primary-down seen in mods, primary-up finishes (missed stage release). Tab actors **press-arm only** (`armTabDrag`) | Tab-actor `motion-event` / `button-release` for drag; dual event owners; drop stage listeners mid-gesture; 120Hz `_handleMoving` when pointer unchanged |
| **Chrome live reorder (preview)** | Float min-width chip + gap (= chip size) + sibling pack via `_syncReorderSiblingPack` / `tabStripEqualFillSizesWithGap` / `tabStripFlowLayoutWithGap`. Gap scoot = **pointer × sibling center** (PR15). Membership = `chipIntersectsTabStrip` / `findTabStripIntersectingChip` / `pointerOnTabStrip` (strip ∪ `TAB_STRIP_HIT_PAD_PX`; multi-row = union of rows) | `.window-tabbed-tab-reorder-insert` product paint; leading-edge scoot; pointer-only strip membership; dual `set_width` + stale `translation_*` mid-drag |
| **Peel / MOVE APP (leave strip)** | Forge synthetic peel → `_startTabMoveGrab` (no Meta `begin_grab_op` ownership). Chip tracks via `_syncTabDragChipToPointer` / stage-event coords + pointer poll (`getDragPointer`). Tile drop-zones when not over a strip; re-enter strip ⇒ REORDER float+gap again | Hand off peel motion to `begin_grab_op`; freeze chip on fast leave; skip origin re-entry gap |
| **Tab drag release residual clear** | `clearTabDragResiduals` on every button-release / disarm (pressed/dragging classes, reorder preview, drop-zone paint; cancels stage + poll) | Per-path partial teardown that leaves stuck highlight or zones |
| Keyboard / tab / Meta focus | `wm.afterFocus(node, { source })` | `renderTree("focus")`; inline F+D+B |
| Commit structure or size | `wm.commitLayout(reason, { force })` | Second `renderTree` in the same gesture |
| Re-raise current / new open leaf after structure | `wm.settleTabFocus(node)` | Second full commit “for tabs” |
| After mass apply / last raise, restack all tab strips | `SessionApi._settleAfterRunSteps` (WR14 RunSteps) + `_restackTabDecorations` (ApplyLayout Done; **no** second raise) | Skip ApplyLayout; extra tab-click handler; Done-path `settleTabFocus` raise |
| **Show a child in a TABBED/STACKED group** | `wm.revealGroupChild(node, { keyboard, pin })` (includes slot reassert R025 + adopt live pin R026) | `parent.lastTabFocus =` + `raise()` in a new file |
| Pin open leaf during layout residual | `wm.pinLayoutOpenLeaf` / `restoreLayoutOpenLeafIfStolen` | Adopt Meta steal as the new leaf |
| **Group two windows as tabs/stack** | `tree.group(a, b, layout?, opts?)` — named I2 op; implements via `mergeWindowsIntoGroup`. Default **TABBED**; **STACKED** when stacked mode + `dnd-center-layout` stacked, or opts | Flip `parent.layout` in DnD/command; new wrap twin of merge |
| **Ungroup / dissolve a CON** | `tree.ungroup(node)` — promote children to grandparent (order preserved). WINDOW uses parent CON. No-op MONITOR/ROOT/WORKSPACE. One CON only (not recursive flatten; no Meta mon peel) | `_layoutOp` silent peel (deleted P3); `cleanTree` / `auto-exit-tabbed` as product ungroup |
| **Focus parent / child (C4)** | `tree.focusParent` / `tree.focusChild` — elevate/descend `tree.focusUnit`; activate leaf via `revealGroupChild` (tab/stack) or `_activateWindowNode` + `afterFocus`. No-op at MONITOR/ROOT/WORKSPACE | Twin focus stack; Meta-focus a CON; skip `afterFocus` / `revealGroupChild` |
| **Move in / out of CON (C4)** | `tree.moveIn` / `tree.moveOut` — reparent **layout unit** (`layoutUnit` / elevated `focusUnit`) into existing sibling CON / out to grandparent via Node child-list APIs. Tab/stack dest → `normalizeGroupToHomeMonitor` (D044). No invent-group (use `group`) | Directional edge auto-pop; assign `childNodes`; second DnD engine; spanning tab chrome |
| **TABBED/STACKED group home mon** | `tree.groupHomeMonitor(con)` → tree MONITOR index (`treeMonitorIndexOfNode`) | Meta `get_monitor()` / `sameParentMonitor` as home (can lie mid-thrash) |
| **Normalize mon-local group (D044)** | `wm.normalizeGroupToHomeMonitor(con)` / `wm.normalizeTabGroupsToHomeMonitors()` — rehome Meta members to CON MONITOR ancestor; **keep group** (no auto-peel) | Auto-peel on mix; spanning chrome; profile span sugar |
| **Change CON layout mode** | `tree.setLayout(con, layout, opts?)` / `Node.setLayout` (I1: no reparent/flatten; optional `lastTabFocus`, `resetPercents` on H↔V) | Assign `parent.layout`; silent `replaceChildren` / flatten nested CONs for mode change |
| Split a leaf H/V | `tree.split(node, orientation)` | Hand-built CON + splice |
| Slot-split focused/target unit (D032) | `tree.slotSplitUnit` / `wm.slotSplitForInsert` / leftover 1-child H/V join; late-identity TILE via `wm._adoptOpenIntoTileSlot` (not at unknown map) | Even 3rd H/V sibling; `createNode(bag)` as a tab; reserve a TILE wrap for a window that stays FLOAT (R031) |
| Five-zone hit / paint | `drop-zones.js` `buildDropZones` / `hitTestDropZone` | Edge-band / grab-origin geometry |
| **Would this drop change the tree?** | `dropChangesStructure` (`lib/extension/drop-intent.js`) | Positional `_isNoOpDrop` that ignores layout |
| **Would this drop overflow app mins?** | `dropWouldOverflowMins` / `swapWouldOverflowMins` / `unitMins` (`drop-intent.js`) + `readWindowMinSize` / `noteWindowMinFromClamp` / `noteWindowMinFromOversizedFrame` / class floor (`tree-layout.js`) + env floor `defaultMinTileSize` (`min-tile-size.js`; unset → **256×144**). Durable `window-mins.json`. Passive learn only (clamp vs request / settled frame larger than slot). **No shrink-probe.** Preview paints **per-zone** `.window-tilepreview-invalid` (HSPLIT / VSPLIT / TAB independent); refuse execute. Checks **dragged + dest window/group**. Tab join = full pane; edge = half on axis. Floor always applies — never “unknown → allow” | Shrink-probe / mid-drag dest discover-resize queue; fail-open for unreadable mins; refuse path outside `moveWindowToPointer`; painting all zones red from one axis overflow |
| Keybind move/swap past min overflow | `tree.move` / `tree.swap` / `swapSibling` skip candidates via `swapWouldOverflowMins` until a legal slot (or none) | Applying a move that leaves any involved app below its min |
| Titlebar/CSD move pointer | Real Mutter grab; `getDragPointer` prefers **live** pointer when it moved; `_armGrabPointerTrack` updates parked track **and** drives `_handleMoving` (PROPAGATE) so overlays do not depend solely on Meta geom | Preferring stuck grab-start track over live pointer; titlebar paint only from `position-changed` |
| Execute a tile drop | `DragDropManager.moveWindowToPointer` → intent + merge/split | Parallel session-only structure |
| Empty-monitor drop | `resolveEmptyMonitorDrop` + `_commitEmptyMonitorDrop` (leaf only) | Mid-drag rehome (R012); `_rehomeWindowPreservingContainer` (R022) |
| New-window home | `resolveOpenAppPlacement` (dock → empty-head → window-actual → LFT) | Pointer-on-empty falling through to other-mon LFT (R021) |
| **Free open when split would overflow mins** | `resolveOpenMinPlacement` / `bfsOpenMinTabCandidates` (`open-min-place.js`) via `wm._decideOpenMinPlacement` → tab on first same-mon unit that fits, else float (`addFloatOverride`). Uses `readWindowMinSize` (hints ∪ known ∪ class ∪ env floor). Also on late-identity TILE via `wm._adoptOpenIntoTileSlot` (null map skips open-min at track). Tiny-pane QoL stays separate. **Not** PlaceNext/ApplyLayout pins; **not** DnD (DnD still refuse) | Retargeting pinned apply slots; cross-mon tab walk (D044); replacing tiny-pane setting; fail-open “unknown mins”; shrink-probe; blind late-adopt `slotSplit` that skips mins |
| **Mid-session TILE slot overflow** | `slotOverflowsMins` / `frameOverflowsSlotForLearn` / `resolveTileOverflowPlacement` (`open-min-place.js` + `tree-layout.js`) via `wm.rehomeIfSlotTooSmall` — learn (`noteWindowMinFromClamp` ∪ `noteWindowMinFromOversizedFrame`) then same-mon tab BFS, else `addFloatOverride`; peel + single-child H/V join / `cleanTree`. Detect = mins overflow **or** learnable frame>slot. Skip ApplyEpoch / GRAB_TILE / max-fs. Debounce `overflowRehome:<id>`. | Restore-to-illegal-slot (D026 fight); shrink-probe; cross-mon BFS; merging tiny-pane QoL; leave visual overflow when mins still at floor |
| Admit live Meta windows missing from the tree | `wm.admitUntrackedWindows` / LayoutBatch `admit` | Plan/map-pin from GetTree only (untracked X11 maps stay invisible) |
| **Reconcile / `forge layout` apply** | DBus `ApplyLayout` (async start) + ApplyEpoch + slot machines (D037–D043). Planner: `lib/shared/layout-plan.js` `planReconcile` | Port `layout_plan.py` into `cli/`; CLI GetTree poll loop; overload `LayoutBatch` as the product entry |
| **Layout profile preflight** | `validateReconcileProfile` / `validate_reconcile_profile` (`layout-plan.js` / `layout_plan.py`) before open/bind / ApplyLayout | Twin validator; skip validate and let bad JSON mutate the desk |
| Apply-time home authority | `beginApplyEpoch` / `endApplyEpoch` (SM1; D039). Desired forest is the only mon/TILE-home writer while apply is live | Extra `_layoutApplyLive2` flag; entered-monitor rehome during apply |
| Hard-ready (ApplyLayout / product layout) | In-slot predicate (SM2; D040): TILE\|grab + desired mon + parent CON + ε rect. Slot machines in `layout-apply-slot.js` (`startSlotMachines` / `collectSlotMachines`): parallel independent slots; TABBED/STACKED = one machine; retry place N=2 (SM4). Hollow replan → `ensureMetaInSlot` (`wm._ensureTiledForSlotPlace` + `reassertNodeToSlot`) | TILE-anywhere as success; twin place planner; per-window tab machines; CLI GetTree poll |
| Late PlaceNext identity → TILE | `wm._ensureTiledForSlotPlace` (float mode + unmaximize, **no** LFT adopt) then reparent/idle Meta | Skip `processFloats` after adopt; adopt-into-LFT before rehome; D026 mid-ApplyEpoch |
| Float / `allows_resize` | Gatherer: `allowsResizeForFloatPolicy` (D051) — Meta false while max/fs is **not** `no-resize` | Raw `allows_resize()` while covering → TILE→FLOAT; bypass D026 / late-adopt TILE |
| Apply `Done.ok` | Forest match for every **required** TILE slot (D041). Required `hard-failed` → `ok: false` | Focus-only verify as success; standing best-effort `ok: true` |
| Apply open dest | PlaceNext / bind **into slot or skeleton PH** (SM3; D042) | Mon-root-only PlaceNext + belt as happy path |
| Soft focus residual (ApplyLayout) | `runSoftFocusBarrierOnSignals` + `settle-math` + `pinLayoutOpenLeaf` | Third settle brain; twin of `revealGroupChild` |
| Soft geom residual | in-process settle bag only (CLI geom poll removed AL8) | Re-apply layout until rect “looks right” |
| Hard-ready before a non-layout CLI act (launch) | `wait_for_wm_class` + `window_is_settled` (launch/wait-window only) | New TILE poll on `forge layout` |
| Soft timeout math | `settle-math.js` / `settle_heuristics.soft_timeout_from_latencies` | A third rolling-max helper |
| First-ever soft wait | `soft_timeout_for_key` (peer-host same class seed, else learning trial) | Always 6–10s on a new hostname when the file already has another host |
| Open-map quiet (extension) | `OpenCommitManager` + `layout-open.js` | Extra 250 ms sleep on create |
| Forge-caused vs external geom | `isForgeCausedGeometrySignal` (`layout-sensors.js`) | Ad-hoc `_suppressGeom` reads |
| TILE already at slot? | `shouldChromeOnlyGeometry` / `wm._tiledWindowAtTreeSlot` | Local ε compare |
| **Restore TILE to its slot** | `wm.reassertNodeToSlot` (unmaximize / unfullscreen first when needed) | `onExternalGeometry` reassert (AC1: verify is log-only) |
| Unsolicited TILE geom | `shouldRestoreTileSlot` + `wm._restoreTileToSlot`. If `slotOverflowsMins` (mins, not max/fs) → `wm.rehomeIfSlotTooSmall` **instead** | Skip fullscreen and leave it; float-on-max; restore into a slot the client cannot fit |
| User TILE resize (mouse/key/expand) | `tree.resolveOwningSplit(unit, axis\|edge)` + `wm.applyOwningSplit` (I3). Grab keeps cumulative `_handleResizing` / `_applyOwningSplitFromGrab`. Expand/shrink = two calls (H then V; REG-expand-dual-axis). Unit = window or tab/stack bag | Twin percent math; treat grab as “external drift”; child+parent expand walk |
| Display / workareas settle | `workareas-policy.js` + `monitor-recovery.js` | Window TILE wait for mon remap |
| Presentation zoom (full/H/V) | `wm.toggleZoom` + `zoomRect` (`zoom.js`); `tree.apply` / borders use `tree.paintRectForWindow` | Compat.maximize / Meta fs; border from unzoomed slot |

`settleTabFocus` is **chrome** (F+Dfocus+B). It is **not** D019 wait-for-quiet.

H/V **split chrome** (FCC C3 / I5 one-edge blue borders) was **removed** (D047) —
focus borders and drag/place preview hints remain.

---

## Open leaf (visibility)

TABBED/STACKED children share one content rect. “Visible” means:

1. `CON.lastTabFocus` = that Meta window
2. `raise()` that window
3. Tab-strip CSS follows **lastTabFocus**, not keyboard focus (D018)
4. Optional: pin (layout residual) and/or keyboard activate

Open leaf ≠ keyboard focus. Do not sync GetTree `lastTabFocus` from Meta focus
(R014). Session **save** may (`syncLastTabFocusFromFocus`).

`wm.revealGroupChild(node, { keyboard = false, pin = false })`:

| `keyboard` | Effect |
| --- | --- |
| `false` | LTF + optional pin + `reassertNodeToSlot` + raise + `settleTabFocus` |
| `true` | Same, then focus + activate + `afterFocus` (restack last; R032) |

Tab click (R025): reassert **only** the revealed child. Do **not** reassert
from `afterFocus` / `updateTabbedFocus` (intra-tab PWA frame-lie). Skip when
`zoomMode` is set (D030).

If a layout pin is already live and reveal shows a **different** child
(tab click, keyboard), **adopt** the pin onto that child (R026). Otherwise
the following Meta `focus` looks like steal and snaps back to the layout
leaf. Do not start a pin when none is live.

`SessionApi._focusOp` is a thin caller (`pin` default true). Snapshot persist
(`session-layout`, `tree-snapshot`) may still write LTF as **data**.

`updateTabbedFocus` / `updateStackedFocus` **adopt the argument** as open leaf.
Do not call them on keyboard focus when a pin must win.

---

## Settle (ApplyLayout owns product layout waits)

Meta has no “settled” signal (D019). Product `forge layout` does **not**
poll GetTree for hard/soft/focus.

| Layer | Waits? | Owner |
| --- | --- | --- |
| Formula | No | `settle-math.js` ≈ `settle_heuristics` |
| CLI layout (product) | No — observe only | `layout_apply_client` → `ApplyLayout` + Progress/Done |
| ApplyLayout (D037–D043) | Yes — Meta signals + bags | ApplyEpoch + in-slot hard + slot machines (SM1–SM4). Focus/soft once after all-hard (SM5 / L4.6); overlay clear = all-hard (SM7 / D043); verify ≠ Done.ok. Belt deleted (D042/SM6; D014 superseded) |
| Extension interactive | No poll — signals + echo + open-quiet | `layout-epoch`, `OpenCommitManager`, pin 15s |
| Display | Fixed debounce | workareas / monitor-recovery |

Interactive moves: `commitLayout` + echo suppress + (IC3) snap TILE back if
the client then resizes. Do **not** add a GetTree-polling
`wait_until_hard_ready` inside the Shell. IC4 (fold leftover CLI polls)
is **skipped** — AL8 deleted the product layout poll path.

---

## Drop semantics (D0 + D024)

| Zone | Result |
| --- | --- |
| TOP / BOTTOM | VSPLIT (source above / below) |
| LEFT / RIGHT | HSPLIT (source left / right) |
| CENTER | Join or create TABBED (or STACKED if mode on) |

No-op only when **parent + order + layout** already match. CENTER on two
H/V siblings is a **layout change** (group), never “already after target.”

Execute CENTER group via `mergeWindowsIntoGroup`, not a second flip in
`_executeDropOperation`.

Orientation-mismatch edges (BOTTOM onto HSPLIT, etc.) **wrap the target**
in a new CON. Do not reuse a MONITOR that already has siblings (R023).

Empty-mon drop moves the dragged **leaf** only (R022).

---

## Tile geometry (D026, IC3)

For `mode === TILE`:

| Event | Policy |
| --- | --- |
| Forge `move` / apply | Suppress + echo; chrome only |
| Live grab resize/move | Existing grab handlers (percents / preview) |
| Unsolicited size / maximize / Meta fullscreen | Restore to `renderRect` (`reassertNodeToSlot`) |
| Lone-tile maximize-on-single | Only when `window-maximize-on-single` is **on**; default off → D026 restores like multi-pane |
| Forge zoom full/width/height | `wm.toggleZoom` + `zoomRect` (D030) — presentation flag, **not** Meta fullscreen |

`LayoutController.onExternalGeometry` stays **sensor-only** (AC1). Authority
restore is a dedicated handler, not verify-driven reassert.

---

## Raise is multi-path on purpose

Do not invent `raiseWindow()` that also does `make_above`, fullscreen demote,
or session DFS. See DESIGN § Raise / restack.

---

## Checklist before a “small fix”

1. Which **job** is this?
2. Does the catalog already name an API?
3. If yes: call it; delete the one-off if you just added a twin.
4. If no: is this the same job with a missing case? Extend. New domain? New
   sibling on the same type, plus a row in this file.
5. Name the **phase** for layout work (skeleton / open / bind / focus /
   residual) — do not paper a structure bug with a wait.
