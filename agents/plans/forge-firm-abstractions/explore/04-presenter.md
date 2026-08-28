# Exploration notes — presenter / paint

**As of:** 2026-08-27
**Domain:** presenter
**Audience:** firm-abstractions planning (P0a). Not an implement slice.

TOM is the same tree in proto and Forge. Presenters differ: proto paints
DOM (CSS flex + tab strip), Forge paints Mutter frames + St chrome.
D069 / D046 / D030 stay **presenter contracts**. Do not put them in TOM.

```text
proven  tree.js:Tree.render (~L3167) = processNode + apply (+ cleanTree
        re-layout). processNode writes rect/renderRect; apply calls
        wm.move → Meta.move_resize_frame.
proven  proto render-desk.mjs does not call paneRect; it paints CSS flex
        from node.percent and only the open TAB/STACK child.
```

### Scope

Opened:

- `docs/dev/rendering.md` — `renderTree` idle body order
- `docs/dev/architecture.md` § Layout control loop (CL0–CL2)
- `docs/dev/contracts.md` — D069 / D046 / D030 job rows
- `agents/design.md` § Tab/stack peer geometry (D069), Raise/restack,
  Tab chrome layer (D046)
- `agents/design/CHANGELOG.md` D030
- `agents/plans/forge-tab-peer-geometry.md` (D069 FIRM)
- `lib/extension/tree.js` — `Node.rect`, `Tree.render` / `apply` /
  `processNode` / `processTabbed` / `processStacked` / `_applyDecorationRect`
- `lib/extension/tree-layout.js` — percent → px, mins, tab wrap
- `lib/extension/decoration.js` — `#forge-tab-chrome`, borders
- `lib/extension/zoom.js` — D030 paint flag
- `lib/extension/layout-apply-chrome.js` — epoch overlay (not TOM)
- `lib/extension/window.js` — `renderTree`, `move` / `_moveImpl`,
  `toggleZoom`, `reassertNodeToSlot`, post-echo heal
- `lib/extension/focus.js` — `reassertAllTabStackSlots` (visible-first)
- `lib/extension/drop-zones.js` — paint rects only
- `lib/extension/drag-drop.js` — preview actors (paint only)
- Proto: `render-desk.mjs`, `render-tree.mjs`, `tom/sizing.mjs` `paneRect`,
  `tom/kernel.mjs` Node fields

Did **not** open (other notes / later):

- Full `tree.js` child-list / TreeOps (02-forge-tree)
- Full `window.js` signal hub (03-window-wm)
- ApplyEpoch / H1 / session-layout (05-apply-recovery)
- DnD execute / peel / `moveWindowToPointer` (06-surfaces-twins)
- `layout-apply-slot.js` slot machines (epoch, not desk paint)

### Current objects (as the code is)

| Name | File:symbol | What it actually does today |
| --- | --- | --- |
| `LayoutController.requestLayout` | `layout-controller.js` | Debounce → `renderTree`. Not paint. |
| `WindowManager.renderTree` | `window.js:renderTree` (~L2645) | Idle coalesce. Order: prune → normalize groups → `processFloats` → fullscreen-float demote → `tree.render` → `reassertAllTabStackSlots` → maximize-on-single → decoration → borders. Then post-echo heal + verify sensor. |
| `Tree.render` | `tree.js:render` (~L3167) | `processNode(this)` then `apply(this)`. If `cleanTree()` mutates, process+apply again. |
| `Tree.processNode` | `tree.js:processNode` (~L3445) | MONITOR: Meta workarea → `applyMargins` → `processGap` into `node.rect`. CON: `computeSizes` + split/stack/tab child `rect`. WINDOW: `renderRect = processGap(node)`. Also detaches/hides leftover tab decorations. |
| `TreeLayout.computeSizes` | `tree-layout.js:computeSizes` (~L683) | Percent → pixel sizes. TAB/STACK: every child gets full parent size (shared slot). H/V: min redistrib + remainder. **Writes `child.percent` back** unless `skipWriteBack` / any `userSized`. |
| `TreeLayout.splitChildRect` | `tree-layout.js:splitChildRect` (~L89) | H/V child AABB from sizes[]. |
| `TreeLayout.tabbedChildRect` / `stackedChildRect` | `tree-layout.js` (~L138, ~L223) | Shared content rect; bar height reserved. Wrap: `planTabbedWrap`. |
| `Tree.processTabbed` / `processStacked` | `tree.js` (~L3782, ~L3807) | Assigns that shared `child.rect`, ensures St decoration, `_applyDecorationRect` (set_size/position + attach tab). |
| `Tree.apply` | `tree.js:apply` (~L3181) | Every TILE WINDOW with a live `renderRect`: `paintRectForWindow` → `wm.move`. Skips placeholders, live Meta-fs, lone-max (unless zoom/`firstRender`). Suppress rehome+geom around the loop. |
| `Tree.paintRectForWindow` | `tree.js:paintRectForWindow` (~L3237) | Slot = `renderRect \|\| rect`; if `zoomMode`, `zoomRect(slot, workarea, mode)`. Floats → null. |
| `WindowManager.move` / `_moveImpl` | `window.js` (~L1809, ~L1832) | Host chokepoint: dest-mon, min clamp, Wayland buffer-scale, offscreen clamp, ε no-op, `Compat.unmaximize`, `move_frame` + `move_resize_frame`. |
| `Node.rect` setter | `tree.js` (~L192) | Stores `_rect`. CON/MONITOR/ROOT/WS: **also** `actor.set_size` + `set_position`. WINDOW: store only. |
| `Node.render` | `tree.js:render` (~L1037) | Tab title label refresh. Not slot math. |
| `Node._createDecoration` | `tree.js` (~L955) | CON ctor creates `St.BoxLayout` and `attachTabDecoration`. |
| `DecorationManager` | `decoration.js` | `#forge-tab-chrome` host, `attachTabDecoration` / `trackChrome`, `updateDecorationLayout`, focus borders in `window_group`. |
| `FocusManager.reassertAllTabStackSlots` | `focus.js` (~L225) | D069 two-pass: open leaf (`lastTabFocus`) then buried TILE peers → `reassertNodeToSlot`. |
| `WindowManager.reassertNodeToSlot` | `window.js` (~L6464) | One TILE → `move(paintRectForWindow)`. No `processNode`. |
| `zoom.js` | `zoomRect` / `toggleZoom` path | Presentation flag on WINDOW. `apply` paints overlay; topology unchanged. |
| `LayoutApplyChrome` | `layout-apply-chrome.js` | Epoch dim+spinner on `uiGroup`, parked **above** tab chrome. Not desk slots. |
| `drop-zones.js` | `buildDropZones` / `zonePaintRects` | Pure hit + AABB paint partition. St.Bins live in `drag-drop.js`. |
| Proto `renderDesk` | `render-desk.mjs` | DOM: monitors from `forest.monitors[].geom`, children via `api.children`, CSS `flex: percent`. TAB/STACK: strip + **open child only** `{ fill: true }`. |
| Proto `paneRect` | `tom/sizing.mjs:paneRect` (~L80) | Pure query: MONITOR geom + ancestor percents; TAB/STACK fill. **Not** used by `renderDesk`. Used by Mark 2 Launch / tests. |
| Proto `renderTreeGraph` | `render-tree.mjs` | Cytoscape **debug graph**, not desk paint. |

### Intended layer vs actual layer

| Object | Target | Actual today |
| --- | --- | --- |
| Percent / `userSized` / layout / `lastTabFocus` | **TOM** | On `Node` (GObject) + proto forest. Shared. |
| `computeSizes` / split / tab / stack AABBs / `planTabbedWrap` | **Presenter** slot math (gi-free next to TOM) | `tree-layout.js` mixed: some pure, plus GLib env, Meta mins, percent write-back |
| `processNode` workarea fetch | **Host** input | Inside `Tree.processNode` (Meta `get_work_area_for_monitor`) |
| `node.rect` / `renderRect` | Presenter **view** on nodes | Stored on TOM Node; setter paints St actors |
| `Tree.apply` / `wm.move` | **Host** | Correct chokepoint; also raise on zoom |
| Tab chrome `#forge-tab-chrome` | **Presenter** + **Host** (Mutter layer) | `DecorationManager` — product chrome, not TOM |
| D069 visible-first + shared slot | **Presenter** policy | Implemented in `processTabbed`/`apply` + `reassertAllTabStackSlots`. TOM only stores `lastTabFocus` |
| D030 `zoomMode` | **Presenter** flag | Field on `Node` (model leak); math in `zoom.js` is already pure |
| Layout-apply overlay | **Epochs** chrome | `layout-apply-chrome.js` — correct (not TOM) |
| `processFloats` every render | **Host** classification | Mutates `node.mode` inside the paint idle |
| `cleanTree()` inside `Tree.render` | **TreeOps** | Topology repair during present |
| `handleMaximizeOnSingle` | **Host** presenter policy | Meta maximize after apply — not TOM |
| Raise / restack (tab, focus, session, float-under-fs, Wayland pin) | **Host** (several jobs) | Do **not** unify — `design.md` § Raise/restack |
| Drop-zone AABB / trapezoids | **Presenter** / Surfaces paint | `drop-zones.js` already gi-free |
| Proto `renderDesk` | **Presenter** (DOM) | Already TOM-free walk |
| Proto `paneRect` | Slot query (Presenter or TOM-adjacent) | Lives in proto TOM `sizing.mjs`; desk presenter ignores it |

Contamination (policy/paint/Meta in the wrong type):

- `Node.rect` setter paints CON/MONITOR `St.Bin` — **model = presenter leak**.
- `computeSizes` writes `percent` during paint — **presenter mutates TOM**.
- `tree-layout.processGap` branches on `node.nodeValue.get_wm_class` (Waydroid) — **host in “pure” math**.
- `zoomMode` / `tab` / `decoration` / `previewZoneActors` live on `Node`.
- `Tree.render` calls `cleanTree()` — **TreeOps inside presenter**.
- `processTabbed` creates/measures St tabs while assigning slots.

### Strengths (keep)

- **Single Meta chokepoint.** All TILE placement goes through `wm.move` →
  `move_resize_frame`. `tree.apply`, `reassertNodeToSlot`, zoom, D026
  restore all use `paintRectForWindow` (zoom-aware). Contracts row
  “Restore TILE to paint target.”
- **Slot math already extracted.** `tree-layout.js` split/tab/stack/wrap
  functions take rects + numbers, not St. Tree thin-wraps.
- **TAB/STACK share one pane in both codebases.** Forge
  `computeSizes` returns full parent size for TABBED/STACKED
  (`tree-layout.js` ~L690–694). Proto `paneRect` skips bag layouts
  (`isBagLayout` fill). Proto desk `{ fill: true }` is the same rule.
- **D069 visible-first is already a second presenter pass**, not a TOM
  op. `reassertAllTabStackSlots`: open leaf then buried; buried stay
  **mapped**. Do not move this into TreeOps.
- **D046 chrome layer is a host parking rule**, not restack-vs-window.
  `#forge-tab-chrome` in `uiGroup` above `window_group` / below
  `top_window_group`. Apply overlay may only
  `set_child_above_sibling(overlay, layer)`
  (`layout-apply-chrome.js` ~L623–626).
- **D030 zoom is paint.** `zoom.js` does not splice children. `toggleZoom`
  → `commitLayout("zoom")`. Slot (`renderRect`) stays; paint dest is
  overlay. Any chord clears any mode.
- **Raise paths stay many.** Tab click, focus manager, session restore,
  float-under-fullscreen, Wayland transient pin are different failures.
  Do not recommend a unified `raiseWindow`.
- **Verify is a sensor** (AC1). Presenter commits; mismatch does not
  auto-`requestLayout`.
- **Proto desk does not mutate the forest.** `renderDesk` is
  `replaceChildren` + CSS. Graph is diagnostic. Evidence the TOM can
  sit behind two presenters.

### Weaknesses / duck-tape

| Failure class | Symptom in code | Why the abstraction is wrong |
| --- | --- | --- |
| Model paints | `Node.rect` setter `actor.set_size/set_position` for CON/MONITOR (`tree.js` ~L192–207) | Slot assignment should not be a Clutter write. WINDOW already splits store vs Meta (`apply`). |
| Presenter writes TOM | `computeSizes` assigns `childNode.percent` after min paint (`tree-layout.js` ~L725–737) | Effective-percent repair is TreeOps/sizing, not a paint side effect. Mid-batch `skipWriteBack` is a bandage. |
| Slot + chrome in one walk | `processTabbed` assigns `child.rect` **and** `_applyDecorationRect` (St size, attach tab, `child.render()`) | Slot AABB is gi-free; tab actors are host. Coupled walk makes proto share hard. |
| Apply unordered, D069 ordered | `tree.apply` `forEach` `getNodeByMode(TILE)` (DFS, not LTF-first) then `reassertAllTabStackSlots` re-moves tab peers | Visible-first is a **second** Meta pass because apply has no paint order. Twin of the same slot. |
| Classification in paint idle | `processFloats` every `renderTree` rewrites `node.mode` + `make_above` | Float vs TILE is host/policy; running it as a render prelude hides that. |
| Topology in `Tree.render` | `cleanTree()` then re-process (`tree.js` ~L3171–3177) | Unary flatten is TreeOps. Presenter should not own a structural heal. |
| View fields on Node | `zoomMode`, `renderRect`, `tab`, `decoration`, `previewHint` | Allowed as *view* only if TOM export can ignore them. Today GObject Node *is* the TOM. |
| Mins + gaps in slot file | `readWindowMinSize` + GLib.getenv + class-floor persist in `tree-layout.js` | Client mins are product/host data. Slot math should take mins as input. |
| Maximize-on-single after apply | `handleMaximizeOnSingle` Meta-maxes a lone TILE | Fights `apply` (skip lone-max unless zoom/`firstRender`). Presenter policy, not TOM; still a Meta-vs-slot fork. |
| Tab click lives on Node | `_createWindowTab` click → `_activateFromTab` (`tree.js` ~L684) | Surface (pointer) wired inside model ctor. |

### Twins / bypasses

Claimed catalog: `docs/dev/contracts.md`.

| Job | Named API | Twin / bypass |
| --- | --- | --- |
| Commit structure/size | `wm.commitLayout` | Direct `renderTree` still exists (commands, force, RunSteps). |
| TILE → pixels | `tree.apply` via `wm.move` | `reassertNodeToSlot` / `reassertAllTabStackSlots` / `_reassertZoomedTiles` / D026 `_restoreTileToSlot` — same `move`, different callers. Keep as presenter verbs; do not add a fifth. |
| Paint target | `tree.paintRectForWindow` | Bare `renderRect` / `rect` / `get_frame_rect`. Borders and reassert already prefer paint. DnD zone paint prefers **tree slot** over lagging Meta (`drag-drop.js` comment ~L748). |
| Shared tab slot | `processTabbed` + D069 reassert | Focus-path all-peer reassert is **forbidden** (PWA thrash). Reveal is R025 one-child only. |
| Tab chrome park | `DecorationManager.attachTabDecoration` | Restack-vs-window latch (removed). Borders/`rootBin` must stay in `window_group`. |
| Drop preview paint | `buildDropZones` + `zonePaintRects` | Trapezoid **hit** vs AABB **paint** (corners can disagree — documented). Do not invent edge-band geometry. |
| Proto slot query vs desk paint | `paneRect` (TOM sizing) | `renderDesk` CSS flex — two presenters of the same percents. Forge uses pixel AABBs only. |
| Split chrome | removed D047 | Do not revive H/V one-edge blue borders. Focus border + DnD preview remain. |

### Import recommendation

| Surface | Rec | Why |
| --- | --- | --- |
| D069 shared-slot + visible-first | **keep** (Presenter) | FIRM product contract. TOM only has `lastTabFocus` + TAB/STACK layout. Buried-mapped heal is Mutter-specific. |
| D046 `#forge-tab-chrome` | **keep** (Host presenter) | Clutter layering. Proto has a DOM strip; do not share the actor. |
| D030 `zoomMode` + `zoomRect` | **keep** (Presenter) | Already gi-free math. Move the flag off TOM Node onto presenter view-state when Node is split. |
| `tree-layout` split/tab/stack/wrap AABB | **port** next to TOM | Numbers in, rects out. Pair with proto `paneRect` (one slot query). |
| `computeSizes` percent write-back | **reshape** | Extract as TreeOps sizing repair; presenter consumes sizes only. |
| `tree-layout` mins / class floor / GLib | **reshape** | Host adapter feeds mins into slot math; persist stays product data. |
| `Node.rect` actor paint | **reshape** | Setter stores; a presenter bind paints St.Bins. WINDOW already this shape. |
| `Tree.apply` / `wm.move` | **keep** (Host) | The Mutter presenter. |
| `processTabbed` St attach | **keep** (Host) | After slot rects exist. |
| `LayoutApplyChrome` | **keep** (Epochs) | Overlay, not TOM, not desk slots. |
| `drop-zones.js` pures | **keep** / **port** with Surfaces | Already gi-free; paint actors stay GJS. |
| Proto `renderDesk` / `render-tree.mjs` | **keep** as second presenter | Proof TOM is presenter-free. Graph is debug, not product. |
| Unify raise | **discard** | `design.md` § Raise/restack — different failures. |
| Maximize-on-single | **park** | Host chrome policy; do not encode in TOM. |

### Entry points for later agents

- Paint pipeline: `docs/dev/rendering.md` then `window.js:renderTree` idle
  body (~L2660).
- Slot compute: `tree.js:processNode` → `TreeLayout.computeSizes` /
  `splitChildRect` / `tabbedChildRect` / `planTabbedWrap`.
- Meta commit: `tree.js:apply` → `paintRectForWindow` → `window.js:move`.
- Tab peers: `focus.js:reassertAllTabStackSlots`; lock =
  `agents/plans/forge-tab-peer-geometry.md`.
- Tab actors: `decoration.js:ensureTabChromeLayer` /
  `attachTabDecoration`; process-time attach =
  `tree.js:_applyDecorationRect`.
- Zoom: `zoom.js` + `window.js:toggleZoom`; never Meta max/fs.
- Epoch overlay: `layout-apply-chrome.js` (park above tab layer).
- Drop paint only: `drop-zones.js:zonePaintRects`; actors in
  `drag-drop.js:_showDropPreview`.
- Proto analog: `render-desk.mjs` (desk) vs `tom/sizing.mjs:paneRect`
  (query) vs `render-tree.mjs` (graph).

### Open questions

1. Should gi-free slot math live in proto `tom/sizing.mjs` (extend
   `paneRect` with gaps/tab-bar inset) or a new shared `slots` module
   both presenters import? **Blocks P0b owner of percent→px.**
2. Is `renderRect` a presenter cache (scheme allows) or a TOM field?
   Forge WINDOW uses both `rect` (pre-gap) and `renderRect` (gapped).
   Proto has neither — CSS does gap. **Blocks Node split.**
3. Does min-size redistrib belong in Presenter (paint constraint) or
   TreeOps (share repair)? Write-back of `percent` argues TreeOps;
   client mins arguing Host. **Blocks tree-layout split.**
4. Can `tree.apply` take a visible-first order so
   `reassertAllTabStackSlots` is heal-only (optimization D in D069),
   or must the two-pass stay? Not a layer question — do not silently
   change D069.
5. Where does `processFloats` go once render is Presenter-only?
   (Host classifier before present — guess, confirm in 03-window-wm.)

### Do-not-rescan traps

- **`Node.rect` setter paints actors** for CON/MONITOR/ROOT/WS.
  WINDOW does not. Easy to “just set rect” and move chrome.
- **`Tree` is ROOT.** `processNode(this)` walks from the Tree instance.
  No `tree.root`.
- **TAB/STACK percents are stale on purpose.** After H/V→TAB, sibling
  `percent` may still be 0.5; `computeSizes` **ignores** them and fills
  the pane. Proto desk uses `{ fill: true }` for the same bug
  (`render-desk.mjs` ~L108–111).
- **`apply` then D069 reassert.** Apply already `move`s every TILE,
  including buried tabs. Reassert is order + ε heal, not the first
  assignment. Do not delete apply “because reassert exists.”
- **Buried ≠ unmapped.** D069: `move_resize_frame` on a buried peer is
  valid. Proto can skip painting non-open tabs; Forge cannot unmap them
  to “hide.”
- **`paintRectForWindow` vs `renderRect`.** Zoom/D026/borders must use
  paint. Bare slot undoes D030.
- **Tab chrome is not `window_group`.** Borders stay there. Apply
  overlay parks **above** the layer; never lower the layer under the
  overlay.
- **Do not unify raise.** Fullscreen float demote, `make_above`,
  Wayland 50ms pin, decoration restack are separate
  (`design.md` § Raise/restack).
- **`layout-apply-chrome` is epoch UI**, not tab chrome, not TOM.
- **`tree-layout.js` is not fully gi-free.** `import GLib`;
  `readWindowMinSize` / class floor persist sit next to AABB math.
- **`cleanTree` inside `Tree.render`** can change topology mid-paint
  (forge-tdap). Not a pure present.
- **Proto `paneRect` is unused by desk paint.** Sharing TOM ≠ sharing
  pixel pipeline. CSS flex vs AABB is the presenter fork.
- **`render-tree.mjs` is Cytoscape**, not a second desk. Do not treat
  it as the Forge analog.

## Focus answers

1. **Slot math vs `move_resize_frame`.** Pure (almost):
   `tree-layout.js` `applyMargins` / `processGap` / `computeSizes` /
   `splitChildRect` / `tabbedChildRect` / `stackedChildRect` /
   `planTabbedWrap`. Host: MONITOR workarea in `processNode`
   (~L3473–3488); `Tree.apply` → `wm.move` →
   `metaWindow.move_resize_frame` (`window.js` ~L1934–1935).

2. **`Node.rect` setter paints actors?** **Yes** for CON/MONITOR/ROOT/WS
   (`set_size` + `set_position`). **No** for WINDOW — Meta paint is
   `apply`/`move`. Model=presenter leak on container nodes.

3. **`#forge-tab-chrome`.** **Host presenter**, not TOM. St.Widget
   `NO_LAYOUT` in `uiGroup`, untracked host; strips `trackChrome` for
   input. Proto analog is the DOM `.tab-strip` inside `renderDesk`.

4. **D069 visible-first + shared slot.** **Presenter, not TOM.** TOM
   stores layout + `lastTabFocus`. Shared AABB is slot math; Meta
   commit order is Forge presenter policy. Proto paints only the open
   child because DOM can omit buried peers.

5. **Zoom (D030).** Presentation flag. `zoomMode` on WINDOW;
   `zoomRect` overlays workarea; `commitLayout("zoom")`; no child-list
   splice. Confirm: does not mutate topology.

6. **Gi-free next to TOM vs stay GJS.** Extract: AABB/wrap/percent→px
   (minus write-back, minus GLib mins, minus Waydroid wm_class).
   Stay GJS: `move_resize_frame`, St decorations, tab layer,
   `trackChrome`, workarea, glyph measure (`St.Label` in
   `measureMinTabWidth`), borders, apply overlay, Wayland scale align,
   raise/restack, float classify.

7. **Same TOM, different presenter.** Proto Node =
   `{ kind, layout, percent, userSized, lastTabFocusId, geom }`.
   Forge Node has those plus Meta/St. Proto desk walks `api.children`
   and paints flex; Forge walks `processNode` and paints frames.
   Shared rules: H/V in-axis percent; TAB/STACK one pane. Divergence
   is paint (CSS vs pixels; open-only vs all-mapped). They can share
   TOM; they must not share Mutter or DOM.

## Worked tree (slot vs topology)

```text
Given:   Mon1(TAB(A,B,C))  lastTabFocus=A
         percents leftover 0.33 each from a former HSPLIT
Actions: Present (no OpSet)
Expect:  TOM unchanged
         Presenter: A,B,C.rect = same content AABB (bar reserved)
         Forge apply: move A then B,C (D069: A first in reassert)
         Proto desk: strip A|B|C, pane renders A only (fill:1)
```
