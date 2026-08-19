# Fix: open-min group home + titlebar DnD overlays + false red zones

**Status:** ready for implement  
**Branch:** master  
**Updated:** 2026-08-19  
**Context:** Fresh Wayland session eyes-on after `forge layout dev`. Do not close agent Ghostty. Retest via `./scripts/forge/forge-test nested`.

## Problem (user-visible)

1. **Open-min / group home:** Focus left Ghostty → dock-open Nautilus repeatedly → each open keeps tiling/splitting even when panes get too small. Expected: illegal split → same-mon tab (group home) → else float.
2. **Titlebar DnD cold:** After fresh layout, titlebar-drag a tiled app → no drop-zone overlays; drop does not move. Tab-strip drag shows overlays and commits. After that, titlebar DnD starts working.
3. **False reds:** Many drop zones paint red when the drop would still fit real app mins.

## Root causes

### A — Open-min fails open on fresh Wayland

| Fact | Detail |
| --- | --- |
| No Mutter hints | GNOME 46 Wayland: `get_size_hints` / `get_min_size` undefined |
| Fail-open | `resolveOpenMinPlacement`: unknown mins → `{ kind: "split" }` (tested) |
| Class floor is RAM-only | `_classMinFloor` Map in `tree-layout.js`; wiped on Shell restart |
| Open path never probes | `ensureWindowMinSizeKnown` only from DnD grab / mid-drag dest |
| Legal first tile teaches nothing | Learn-from-clamp only when client **refuses** a smaller size |

So after logout/`layout dev`, every dock open of Nautilus has unknown mins → aspect split forever (or until a drag probe / illegal clamp finally sticks). That matches “they all tried to tile … supposed to find a group home.”

### B — Titlebar overlays depend on Meta geom + probe fights the grab

| Path | How `_handleMoving` runs |
| --- | --- |
| **Tab chrome** | Stage `captured-event` / poll → `noteTabDragMotion` → `_handleMoving` |
| **Titlebar/CSD** | Meta `position-changed`/`size-changed` → `updateMetaPositionSize` → `_handleMoving` |

Grab-begin also calls `ensureWindowMinSizeKnown` (32×32 probe). While `_forgeMinProbing`:

- `updateMetaPositionSize` **early-returns** (no `_handleMoving`, no overlays)
- `move()` no-ops (probe owns geometry)
- Probe `move_resize_frame` during a live Mutter MOVING grab can cancel/desync the grab on Wayland → grab-end commit fails / snap-back

After a successful tab peel (or completed probe), mins are known → next titlebar grab **skips** probe → geom path works. That matches “tab first, then titlebar works.”

Also: `_armGrabPointerTrack` only stores coords; it never calls `_handleMoving`. Titlebar therefore has no stage-driven paint path (unlike tab).

### C — False reds from poisoned / premature learn

`noteWindowMinFromClamp` + short delay (~120ms) can learn a still-large frame before Wayland clamp lands → `_forgeKnownMin*` / `rememberClassMin` ratchet **up only** → session-long false `dropWouldOverflowMins` / `zoneOverflow` reds.

## Design (minimal, contract-aligned)

Do **not** change D044, PlaceNext pins, or DnD refuse semantics. Keep fail-open when mins truly unknown. Make mins known earlier and stop probe-from-fighting titlebar grabs.

### Fix 1 — Never probe during an active MOVING grab

**Files:** `lib/extension/drag-drop.js`, `lib/extension/window.js`

- Remove (or hard-skip) `ensureWindowMinSizeKnown` from `_handleGrabOpBegin` for real Mutter MOVING grabs.
- Mid-drag dest probe in `moveWindowToPointer`: do **not** `move_resize` the dragged window; prefer class floor / known mins only while GRAB_TILE. Optional: queue dest probe for after grab-end.
- After grab-end cleanup (idle): `ensureWindowMinSizeKnown` on the released window if still unread (builds floor for next open/drag without fighting the gesture).

### Fix 2 — Titlebar stage motion drives overlays (parity with tab)

**File:** `lib/extension/drag-drop.js` `_armGrabPointerTrack`

On stage MOTION/TOUCH_UPDATE while `_draggedNodeWindow?.mode === GRAB_TILE` and `!_tabDrag`:

1. Update `track.lastX/Y` (existing)
2. Call `_handleMoving(dragged)` 
3. Still `Clutter.EVENT_PROPAGATE` (do not steal Mutter grab)

This paints zones even when Meta geom signals are suppressed or absent, and keeps grab-end target resolution warm via `nodeWinAtPointer`.

Preserve contracts row: live pointer still wins when it moved; track only fills parked case.

### Fix 3 — Make open-min mins available on fresh sessions

**Files:** `lib/extension/tree-layout.js`, `lib/extension/window.js` (+ thin persist helper)

1. **Persist class floors** under `forgeConfigDir()/window-mins.json` (same home as settle-heuristics). Load on WM enable / first read; save on `rememberClassMin` (debounced). Schema: `{ v: 1, classes: { "org.gnome.Nautilus": { width, height } } }`. Cap absurd values on load (same 1200w/800h).
2. **Probe after free-open settle**, not during grab: when a free-open window reaches TILE and mins still unread, `ensureWindowMinSizeKnown` once (idle after open-commit / first successful `move`). Populates floor for the *next* dock open of that class.
3. Keep decide-time fail-open if still unknown (no PlaceNext change). With (1)+(2), 2nd+ Nautilus on a short/tall LFT should tab or float as designed; after one prior session learn, even the first post-login open works.

### Fix 4 — Harden clamp learn (false red)

**File:** `lib/extension/tree-layout.js` (+ probe timing in `window.js`)

- Do not learn while `_forgeMinProbing` restore window (already partially guarded) **or** while node mode is GRAB_TILE.
- Require the post-request frame to be **stable** (two samples or longer Wayland delay) before accepting a new high min; or only raise known min when `learned <= prior - eps` path already proved shrink.
- Allow class floor / known min to **ratchet down** when a forge `move_resize` is accepted below the floor (clear poison).
- Slightly longer `_scheduleMinClampLearn` delay on Wayland compositor (e.g. 250–300ms) to match nest probe timing.

## Tests (L0 first)

| Suite | Add / assert |
| --- | --- |
| `open-min-place.test.js` | unchanged pure contracts; optional: class-floor-only mins → tab not fail-open |
| `WindowManager-open-app-policy.test.js` | With class floor set and no hints → illegal VSPLIT → TABBED; persist load used if mocked |
| `WindowManager-drag-drop.test.js` | Grab-begin does **not** start probe; stage track motion invokes `_handleMoving` / paints preview |
| drop-intent / tree-layout unit | Learn ignores pre-settle large frame; accepted smaller size lowers floor; absurd load capped |
| Existing | drop-intent, drag-drop, bug-151, open-min, open-app-policy stay green |

## Nest verify (FIRM)

```bash
./install --kit=vim
./scripts/forge/forge-test nested run --monitors=1 -- bash -lc '
  env FORGE_JOB=0 forge layout _forge-test-clean
  # then scripted or Eval: open/probe Nautilus mins; titlebar-style GRAB_TILE paints zones without prior tab
'
./scripts/forge/forge-test nested status   # running: False
```

Host eyes-on (operator; do not close Ghostty):

1. `forge layout dev` → focus left Ghostty → dock Nautilus ×N → after mins known (2nd open or persisted floor), illegal splits tab/float instead of shredding panes.
2. Fresh desk: titlebar-drag Nautilus **before** any tab peel → overlays appear; drop commits.
3. Drag onto short TOP/BOTTOM vs LEFT/RIGHT/CENTER → red only where half-axis truly overflows (~360×380 Nautilus).

## Docs / agent notes

- Update `contracts.md` rows: probe not during MOVING grab; titlebar stage drives paint; class mins file.
- Short DESIGN note if persist is new durable state.
- Task: `agents/tasks/forge-open-min-dnd-cold-wayland.md` → completed when done.
- HANDOFF/PRIORITY: replace “eyes-on residual” with this fix outcome.

## Out of scope

- Redesign D039–D044 / belt / PlaceNext retarget
- Changing fail-open policy when mins **truly** unknown after probe attempt
- Personal app branches (`if nautilus`)
- Host logout loops for JS retest (nest only)

## Implementation order

1. Fix 1 + Fix 2 (DnD cold + probe-during-grab) — unblocks overlays/drop
2. Fix 4 (learn harden) — unblocks false red
3. Fix 3 (persist + post-open probe) — unblocks open-min group home on fresh session
4. L0 → nest → update handoff
