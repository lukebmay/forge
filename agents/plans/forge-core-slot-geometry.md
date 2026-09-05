# forge-core-slot-geometry — One slot math SoT (Forest paneRect)

**Status:** in progress
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-04
**Design:** D092 / D093 / D100 — Forest = belief; Meta = reality;
presenter `paneRect` = slot AABB. D103 seeded AABB. Chrome identity =
Forest MONITOR `moNwsW` (workspace **and** monitor).
**Related:** [forge-tab-share-close-reflow.md](./forge-tab-share-close-reflow.md)
(S0–S5 landed), [forge-retire-gobject-topology.md](./forge-retire-gobject-topology.md),
[forge-vinyl-inkscape-investigatory.md](./forge-vinyl-inkscape-investigatory.md)
(vinyl hunt is **not** this plan).

## Goal

Host slot geometry is **rock solid**. One calculation path. Chrome,
Meta frames, tab reveal, and open/launch all trust the same AABB.
No 1/3|2/3 flips, no fly-in-then-snap as the happy path, no WS1
chrome on empty WS2.

**2026-09-04 operator (this plan still owns):**

1. **SG8 — chrome is a workspace+monitor pair**, not monitor-only.
   Switch to WS2, open Guake → no leftover TILE borders/strips from
   WS1 on that head. Host still saw this after logout; SG2 unit is
   not product-done.
1. **SG7 — multi-row tab chrome** shrinks/grows the **window slot**.
   Wrap to another row (`planTabbedWrap`) insets Meta/content again
   like the first row; dropping a row grows the slot back.

## User symptoms (this plan owns)

1. After `forge layout dev`, launch X WebApp → **1/3|2/3** instead of
   50/50 (or equal split of the insert unit).
1. Launch paints at default map geom **then** moves to the tile
   (fly-in). Prefer **direct** first present to the slot.
1. Tab / tile interaction often shrinks a visible pane (~2/3) and
   reveals the app behind — sizes flip. Foundational, not a patch.
1. Empty WS2 + Guake: correct float red border **plus** leftover
   borders resembling WS1. Host 2026-09-04: still after logout.
1. Enough tabs to wrap a second row: content/Meta height does not
   shrink by that extra bar; removing a row does not grow the slot.

Vinyl layout fail is **not** this plan — see
[forge-vinyl-inkscape-investigatory.md](./forge-vinyl-inkscape-investigatory.md).

## Root cause (architectural — not a band-aid)

Seeded present is **three stages with two geometry SoTs**:

```text
paintWmForest          → Forest percent → live.percent
PresentChrome.processNode → computeSizes(live.percent) → child.rect
presentWmSlots         → Forest paneRect → Meta + overwrite renderRect
```

| Path | Math | Failure |
| --- | --- | --- |
| `paneRect` / `forestSlotRect` | Renormalize shares to fill | Correct 50/50 from leftover 0.33+0.33 |
| `tree-layout.computeSizes` | Absolute % + remainder-to-last | 0.33+0.33 → **1/3\|2/3** |

SG1–SG6 landed Forest AABB + WS gate + insert share. Remaining:

- **SG8:** `decorationOnActiveWorkspace` compares **workspace index
  only** and **default-true** when undetermined. `processNode` still
  sizes every `moNwsW` onto the physical workarea. One global
  `#forge-tab-chrome` layer. Borders (`showWindowBorders`) are
  focus-driven, not pair-gated. Switching WS can leave WS1 strips /
  TILE borders on the same monitor.
- **SG7:** `tabbedChildRect` / `forestBagChromeContentRect` already
  multiply `stacked-tab-bar-height` × `planTabbedWrap.rowCount`.
  Unit only locks **one** tab row (35px) vs STACKED N titles. Wrap
  **growth/shrink of Meta dest** when rowCount 1↔2 is not a
  regression. Chrome St rows can grow over content without
  `presentWmSlots` rewriting the slot.

**Law:** when `_liveForestSeeded`, **Forest `paneRect` /
`forestSlotPaintRect` is the only slot AABB**. Chrome may paint from
those rects; it must not invent a parallel pixel split.

**Chrome law (SG8):** a strip or TILE border is visible only when its
Forest MONITOR id `moNwsW` is the **live** pair (Shell active
workspace **and** that output). Not “this monitor index on any WS.”
FLOAT Guake uses FLOATS chrome (Meta frame) only.

## Acceptance

- [x] Seeded present: chrome child rects for H/V == Forest
  `forestSlotRect` (±ε); no second `computeSizes` SoT for Meta/chrome
  slot AABB
- [x] Unit: leftover 0.33+0.33 → chrome path and Meta path both 50/50
- [x] Unit: `decorationOnActiveWorkspace` false when Forest MONITOR
  is on inactive WS even if `live.parentNode` is null
- [x] Unit: map/open `_insertChildPercent` uses Forest membership
  parent when GObject `parentNode` is null
- [x] Unit: first TILE present after map uses slot AABB (no
  intentional float-geom first paint when slot known)
- [x] Unit: TABBED `lastTabFocusId=A` classifies B buried / present
  open-before-buried even when duck `lastTabFocus` is B
- [x] Nest: `smoke-close-reflow` + `smoke-mark2` + `smoke-layout-ws` PASS
- [x] Proto brake green
- [x] **SG8:** active WS2 + Guake FLOAT: no WS1 TILE borders/strips
      on any head. Unit: CON on `mo0ws0` hidden when active WS=1 even
      if monitor index 0 is the current output; `mo0ws1` shown.
      Default-show **forbidden** when Forest MONITOR id exists
      (**unit** 2026-09-04; host eyes still required)
- [x] **SG7:** wrap 1→2 rows: `forestSlotPaintRect` height drops by
      exactly one `stacked-tab-bar-height` (dpi); wrap 2→1 grows it
      back. Same for chrome content rect / `tabbedChildRect`. Nested
      or unit with enough tabs to wrap (min-tab-label-chars)
      (**unit** 2026-09-04; host wrap-row eyes still required)
- [ ] Host (human): layout → launch equal; tab click no shrink;
      empty WS2 no foreign borders; wrap rows inset Meta
  **2026-09-03 fail:** session `BVHnV` dock Nautilus 1/3 — see HANDOFF.
  **2026-09-04 tape (`Kf7DR`):** dock ½-column. SG6 host eyes still
  required. **2026-09-04:** WS2 Guake still chromed the desk (SG8
  unit landed; host re-check after logout).

## Implementation slices

| Slice | What | Exit |
| --- | --- | --- |
| **SG0** | This plan + contracts row: seeded slot AABB = `forestSlotPaintRect` / `paneRect` | Docs point here — **landed** |
| **SG1** | Seeded `processNode` H/V from Forest `forestSlotRect` | **landed** |
| **SG2** | Forest `ancestorMonitor` WS gate (incomplete vs SG8) | Unit inactive-WS hide — **landed**; host still red |
| **SG3** | Open/map percent via Forest membership parent | **landed** |
| **SG4** | Launch direct `moveLiveToForestSlot` | **landed** |
| **SG5** | `presentWmSlots` Forest `lastTabFocusId` | **landed** |
| **G8n-s1** | Peel ROOT spine API — parallel on retire plan | See retire plan |
| **SG6** | D032 insert sizes Forest **direct** parent only | **landed** 2026-09-04. Host eyes still required |
| **SG8** | Chrome identity = Forest MONITOR `moNwsW`. Show iff that pair is live (active WS + that mon). Hide strips **and** TILE borders for other pairs. Skip painting inactive-WS rects onto the physical workarea. FLOAT Guake ≠ TILE chrome | Unit pair-gate **landed**; host WS2+Guake eyes still required |
| **SG7** | Multi-row wrap: Meta dest + content follow `rowCount × barH`. Add/remove wrap row shrinks/grows slot. Tests invert rowCount | Unit wrap 1↔2 **landed**; host wrap-row eyes still required |

**Order now:** SG8 then SG7 (desk-usable chrome before wrap polish).
Do not start G8n peel as the next row.

SG8 vs SG7 share `present-chrome.js` / `tom-live.js` /
`core-slot-geometry.test.js` — **serial**.

## Do not

- Dual-write Forest ← GObject child-lists
- Grow `live-handle.js`
- Invent `Mark2Drop*`
- Reconnect D100 idle restore / entered-monitor / title→`renderTree`
- Patch only `computeSizes` renormalize again and call it done
- Host `forge layout` from agents
- Start G8l / G8o / G9
- Branch: **master**. No commit/push unless operator asks
- Do not skip ROOT `move*`. Do not relocate dual-write into
  tree-api-nav
- Do not ship whole-forest `MON_MISMATCH` RESYNC
- Do not reintroduce raw `move_to_monitor` at map. Do not port belt /
  Mode B
- Nest: `./scripts/forge/forge-test nested --trunk <id>` one CLI;
  hunt `forge-test nested log`; always stop nest. Test layouts only
  `_forge-test-*`
- Install from `~/dev/me/forge` with `./install --dev` (TRACE)
- Proto brake: `cd prototypes/container-motion && npm test`
- Do not key chrome by monitor index alone
- Do not default-show when Forest `moNwsW` exists
- Do not patch-only `tabbedChildRect` without Meta `forestSlotPaintRect`

## Contracts to extend

| Job | API |
| --- | --- |
| Seeded TILE/CON slot AABB | **`forestSlotPaintRect` / `forestSlotRect` / `paneRect`** — chrome + Meta + reassert |
| Active **pair** chrome gate | Forest MONITOR `moNwsW` of CON/WINDOW — workspace **and** monitor |
| TABBED wrap content | `planTabbedWrap` + `tabbedChildRect` + `forestSlotPaintRect` (rowCount × bar) |
| Open share after admit | `_insertChildPercent` via Forest membership parent |
| Seeded tab open-leaf / buried present | Forest parent + `lastTabFocusId` |

## Context for the next agent (SG8 / SG7)

### SG8 paths

- `lib/extension/present-chrome.js` —
  `decorationOnActiveWorkspace` / `workspaceIndexForChrome` /
  `applyDecorationRect` hide
- `lib/extension/decoration.js` — `_conOnActiveWorkspace`,
  `_showAndRestackTabDecoration`, `showWindowBorders` /
  `hideWindowBorders`
- Tests: `tests/unit/extension/core-slot-geometry.test.js` SG2
  (extend to pair, not ws-only)

Trap: `processNode` MONITOR uses `get_work_area_for_monitor` for
**every** ws index → inactive WS chrome gets on-screen rects. Gate
must hide **and** prefer not to show those actors.

### SG7 paths

- `lib/extension/tom-live.js` `forestBagChromeContentRect`
- `lib/extension/tree-layout.js` `planTabbedWrap` / `tabbedChildRect`
- `lib/extension/present-chrome.js` `processTabbed`
- Tests: `tests/unit/tree/Tree-layout.test.js`;
  `core-slot-geometry.test.js` (today 1-row 35px only)

When tab count crosses wrap, present must rewrite Meta dest — St
row hosts growing is not enough.

## Enable / test

```text
npm test -- tests/unit/extension/core-slot-geometry.test.js \
  tests/unit/tree/Tree-layout.test.js
cd prototypes/container-motion && npm test
cd ~/dev/me/forge && ./install --dev
./scripts/forge/forge-test nested --trunk trunk.tabs.open-leaf-one-slot
./scripts/forge/forge-test nested stop
```

## Session note

2026-09-04 — **SG8+SG7 unit landed.** Chrome gate = Forest `moNwsW`
pair (`forestMonitorIdForChrome`); default-hide when that id exists;
inactive MONITOR `processNode` hides chrome and skips workarea paint;
`showWindowBorders` / `restackAllWindowBorders` pair-gated (FLOAT
still restacks). Wrap 1↔2: `forestSlotPaintRect` / `presentWmSlots` /
`processTabbed` height ± one `stacked-tab-bar-height`. Tests:
`core-slot-geometry.test.js` 20 + `Tree-layout.test.js` 78 = 98 pass.
Borders/deco suites 22+44+7 pass. Nest skipped (idle; known tabs
flake). `./install --dev` OK (`v49-90-beta.2-429-gab9173af-dirty`;
Wayland tip deferred). Host: empty WS2+Guake + wrap rows still
human eyes after logout. No `tom-live.js` body change (wrap math
already `rowCount × barH`).

2026-09-04 — **SG6 landed.** `_insertChildPercent` sizes Forest
direct parent only. `wrapNodes` keeps inherited slot share.

2026-09-03 — **SG0–SG5 landed.** D103. Host eyes after Wayland
logout still required for SG6 dock + SG8 chrome.

Do not dual-write. Do not grow `live-handle.js`. Do not invent
`Mark2Drop*`. Do not reconnect D100 handlers. Do not host
`forge layout`.
