# Canonical contracts (use these APIs)

Agent-facing catalog of **the** internal APIs for a job. If a job is listed
here, **do not** hand-roll a parallel path. If the API is missing a behavior,
**extend it first** (or add a sibling on the same module). One-off “fixes”
are how we get directional DnD no-ops and un-restored VLC geometry.

Formulas for focus/structure/open: [actions.md](actions.md).
Architecture: [architecture.md](architecture.md). Why: [DESIGN.md](../DESIGN.md).
Decisions: [DECISIONS.md](../DECISIONS.md) (D018–D019, D023–D026).
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
| Keyboard / tab / Meta focus | `wm.afterFocus(node, { source })` | `renderTree("focus")`; inline F+D+B |
| Commit structure or size | `wm.commitLayout(reason, { force })` | Second `renderTree` in the same gesture |
| Re-raise current / new open leaf after structure | `wm.settleTabFocus(node)` | Second full commit “for tabs” |
| **Show a child in a TABBED/STACKED group** | `wm.revealGroupChild(node, { keyboard, pin })` (includes slot reassert R025 + adopt live pin R026) | `parent.lastTabFocus =` + `raise()` in a new file |
| Pin open leaf during layout residual | `wm.pinLayoutOpenLeaf` / `restoreLayoutOpenLeafIfStolen` | Adopt Meta steal as the new leaf |
| Group two windows as tabs/stack | `tree.mergeWindowsIntoGroup(a, b, layout)` | Flip `parent.layout` in DnD/command |
| Split a leaf H/V | `tree.split(node, orientation)` | Hand-built CON + splice |
| Slot-split focused/target unit (D032) | `tree.slotSplitUnit` / `wm.slotSplitForInsert` / leftover 1-child H/V join | Even 3rd H/V sibling; `createNode(bag)` as a tab |
| Five-zone hit / paint | `drop-zones.js` `buildDropZones` / `hitTestDropZone` | Edge-band / grab-origin geometry |
| **Would this drop change the tree?** | `dropChangesStructure` (`lib/extension/drop-intent.js`) | Positional `_isNoOpDrop` that ignores layout |
| Execute a tile drop | `DragDropManager.moveWindowToPointer` → intent + merge/split | Parallel session-only structure |
| Empty-monitor drop | `resolveEmptyMonitorDrop` + `_commitEmptyMonitorDrop` (leaf only) | Mid-drag rehome (R012); `_rehomeWindowPreservingContainer` (R022) |
| New-window home | `resolveOpenAppPlacement` (dock → empty-head → window-actual → LFT) | Pointer-on-empty falling through to other-mon LFT (R021) |
| Hard-ready before a CLI act | `layout_apply.wait_until_hard_ready` | New TILE poll loop; `wait_for_wm_class` is the leftover to fold (IC4) |
| Soft focus residual (CLI) | `run_soft_focus_barrier` | Fixed `sleep(0.4)` after hard-ready |
| Soft geom residual (CLI) | `run_soft_geom_barrier` | Re-apply layout until rect “looks right” |
| Soft timeout math | `settle-math.js` / `settle_heuristics.soft_timeout_from_latencies` | A third rolling-max helper |
| First-ever soft wait | `soft_timeout_for_key` (peer-host same class seed, else learning trial) | Always 6–10s on a new hostname when the file already has another host |
| Open-map quiet (extension) | `OpenCommitManager` + `layout-open.js` | Extra 250 ms sleep on create |
| Forge-caused vs external geom | `isForgeCausedGeometrySignal` (`layout-sensors.js`) | Ad-hoc `_suppressGeom` reads |
| TILE already at slot? | `shouldChromeOnlyGeometry` / `wm._tiledWindowAtTreeSlot` | Local ε compare |
| **Restore TILE to its slot** | `wm.reassertNodeToSlot` (unmaximize / unfullscreen first when needed) | `onExternalGeometry` reassert (AC1: verify is log-only) |
| Unsolicited TILE geom | `shouldRestoreTileSlot` + `wm._restoreTileToSlot` | Skip fullscreen and leave it; float-on-max |
| User TILE resize (mouse/key grab) | `_handleResizing` → owning-split percents + `userSized` | Treat grab resize as “external drift” |
| Display / workareas settle | `workareas-policy.js` + `monitor-recovery.js` | Window TILE wait for mon remap |
| Presentation zoom (full/H/V) | `wm.toggleZoom` + `zoomRect` (`zoom.js`); `tree.apply` / borders use `tree.paintRectForWindow` | Compat.maximize / Meta fs / `toggleWorkspaceMonocle`; border from unzoomed slot |

`settleTabFocus` is **chrome** (F+Dfocus+B). It is **not** D019 wait-for-quiet.

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
| `true` | Same, then activate + `afterFocus` |

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

## Settle (two brains, one formula)

Meta has no “settled” signal (D019). We do **not** want one JS+CLI waiter.

| Layer | Waits? | Owner |
| --- | --- | --- |
| Formula | No | `settle-math.js` ≈ `settle_heuristics` |
| CLI layout | Yes — poll GetTree | `wait_until_hard_ready`, `run_soft_*` |
| Extension interactive | No poll — signals + echo + open-quiet | `layout-epoch`, `OpenCommitManager`, pin 15s |
| Display | Fixed debounce | workareas / monitor-recovery |

Interactive moves: `commitLayout` + echo suppress + (IC3) snap TILE back if
the client then resizes. Do **not** add `wait_until_hard_ready` inside the
Shell. Fold leftover CLI polls into the existing waiters (IC4).

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
| Lone-tile maximize-on-single | Keep (existing) |
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
