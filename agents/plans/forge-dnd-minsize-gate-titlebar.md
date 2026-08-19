# Plan: Min-size drop gate + titlebar peel from tabs

## Goal

1. **Blocked drop zones:** While dragging a tiled window, if the hovered drop (edge split **or** CENTER tab/stack join) would give that app a slot smaller than its real minimum size, paint a **distinct blocked preview** and **refuse the drop** (snap back / no-op).
2. **Theme:** Replace Forge’s default DnD preview (and matching border) palette with **your** `~/.config/forge` colors; blocked uses your **floated** red.
3. **Regression:** Restore **client titlebar / header-bar** drag to peel a window out of a TABBED/STACKED group into another slot (tab-chip drag already works).

## Locked product choices (from you)

| Topic | Choice |
| --- | --- |
| On blocked release | **Snap back / no-op** (do not commit structure) |
| Tab/stack joins | **Gate on the shared pane** size vs **dragged app** mins only (not max of peers) |
| Blocked look | New invalid class; **not** the soft edge-red used today |
| Colors | Adopt your user stylesheet palette as **bundled defaults** |
| Scope | **Both** features in one effort |

## Evidence already in hand

Nest smoke (4× Nautilus VSPLIT):

- Slot **260px** vs frame **380px** → **+120px** past border (your symptom).
- On Wayland GNOME 46 nest, `Meta.Window.get_size_hints` / `get_min_size` were **undefined**; Forge’s current min redistrib is already a no-op there.
- Client still enforces ~**380px** height; `override_constraints(NONE,…)` did **not** bypass it.
- Therefore: “ignore hints” is a dead end; **refuse bad drops** is the right product move — but the gate needs a **readable** min on the host, or it must **fail-open** when mins cannot be read.

## Architecture

```text
pointer over zone
  → buildDropOperation (existing)
  → dropChangesStructure? (existing no-op paint)
  → dropWouldOverflowMins?(source, target, operation, ctx)   [NEW pure]
       → yes: previewClass = window-tilepreview-invalid; refuse execute
       → no:  existing preview + execute
```

Canonical extension points (contracts):

- Intent pure: `lib/extension/drop-intent.js` (sibling of `dropChangesStructure`)
- Min reader + axis helpers: extend `lib/extension/tree-layout.js` (`minSizeInOrientation` / new `readWindowMinSize`)
- Paint + refuse: `DragDropManager.moveWindowToPointer` in `lib/extension/drag-drop.js`
- CSS: `stylesheet.css` (+ prefs appearance list for the new selector)
- Docs: `docs/dev/contracts.md` row for “Would this drop overflow app mins?”

Do **not** invent a second DnD engine or a parallel preview painter.

---

## Slice 0 — Host min-size probe (gate feasibility)

**Before** coding the refuse path: on **host Wayland** (and nest if needed), discover what Forge can read for mins.

Probe order for `readWindowMinSize(meta)`:

1. `get_size_hints?.()` → `min_width` / `min_height` (current)
2. `get_min_size?.()` if present (newer Mutter)
3. Any introspected GObject fields found in the spike
4. Else `{w:0,h:0}` and **fail-open** (allow drop; no false red)

Record result in the task note. If host also cannot read mins, ship theme + titlebar fix first; keep overflow gate wired but inert until a reader exists (or add a follow-up “learn min from clamp” bag — out of scope unless probe finds nothing *and* you still want a heuristic).

---

## Slice 1 — Theme: Luke palette + invalid class

Update **bundled** `stylesheet.css` defaults to match your user colors:

| Role | Color (from your overrides) |
| --- | --- |
| tiled / tilepreview-tiled (valid edge) | `rgba(59, 1, 224, …)` |
| split borders | `rgba(26, 95, 180, …)` |
| stacked / tilepreview-stacked | `rgba(247, 162, 43, …)` |
| tabbed / tilepreview-tabbed | `rgba(38, 162, 105, …)` |
| zoomed / tilepreview-zoomed | `rgba(176, 16, 128, …)` |
| floated | `rgba(165, 29, 45, …)` |
| **invalid / blocked** | floated red, stronger fill (e.g. border α≈0.7, fill α≈0.45) |

Also:

- Add `.window-tilepreview-invalid`
- Include it in `lib/prefs/appearance.js` preview selector reset/list so prefs theming does not strand it
- Zone non-hover outline can stay neutral or pick a muted tint from your palette — keep readable on dark wallpaper
- After install, your user CSS still wins for selectors you override; defaults help nest / fresh installs

**Note:** Today `.window-tilepreview-tiled` is already a soft red — after this slice, valid edges become **purple** (your tiled), and blocked becomes **floated red**, so the two cannot be confused.

---

## Slice 2 — Min-size drop gate

### Pure API

`dropWouldOverflowMins(source, target, operation, ctx, getMin = readWindowMinSize)` in `drop-intent.js` (or thin wrapper calling `tree-layout` geometry helpers).

Estimate **post-drop slot** for the **dragged** window (and for edge splits, also the residual target slice when they share the axis):

| Hover | Slot estimate (dragged) | Block when |
| --- | --- | --- |
| LEFT/RIGHT | ~½ of target unit width (after gap if cheap) | `minW(dragged) > slotW` **or** `minW(dragged)+minW(targetUnit) > parentW` when both must fit on the axis |
| TOP/BOTTOM | ~½ of target unit height | same for height |
| CENTER → tab/stack / create group | **Full** target pane (`targetRect` / group slot) | `minW > slotW` **or** `minH > slotH` |
| Wrap whole tab CON (edge on group) | ½ of parent of that CON along axis | dragged (+ wrapped unit mins as applicable) exceed parent |
| Empty-mon | work area | mins exceed work area on either axis |

Use existing zone geometry (`drop-zones.js` / `processGap`) where possible; prefer under-estimate of slot (fail closed when mins known) over optimistic.

**Fail-open** when both mins are 0 / unreadable.

### Live wiring

In `moveWindowToPointer` after `_buildDropOperation` / structural no-op check:

- If overflow: set `operation.previewClass = "window-tilepreview-invalid"` (and/or a boolean `operation.blockedByMins`); **preview paints**; **execute path returns without `_executeDropOperation`**
- Structural no-op (already in place) stays as today — do not paint invalid for “already there”

Empty-mon path: same predicate against work-area rect.

### Tests (L0)

- Pure cases: edge half too short; CENTER pane too short; CENTER OK; unreadable mins → allow; tab join uses full pane not half
- Drag-drop unit: preview class invalid + execute not called; valid still commits
- Do not rely on Nest Nautilus for the pure gate (hints may be missing); inject mins via mock/`get_size_hints` shadow like existing e2e helpers

### Docs

- contracts.md: new row **“Would this drop overflow app mins?”** → `dropWouldOverflowMins`
- Short user note in troubleshooting / layouts if useful (optional)

---

## Slice 3 — Titlebar drag out of tab group

### Symptom (your report)

- Tab-chip drag / peel: **works**
- Client titlebar / header-bar drag of a window **inside** TABBED/STACKED: **does not** move into another slot like before

### Contracts to preserve

- Tab chrome: press-arm only; `DragDropManager` owns gesture (`armTabDrag` / stage capture / poll)
- Titlebar moves: **real Mutter** `grab-op-begin/end` (comment already in `_startTabMoveGrab`) — do not force titlebar onto synthetic peel unless nest proves Mutter grab never fires

### Diagnose first (nest)

Minimal repro:

1. Two+ windows in one TABBED CON + one TILE sibling
2. Titlebar-drag the open tab leaf toward the sibling’s edge/CENTER
3. Expect: `GRAB_TILE`, zone paint, peel/commit on release

Likely causes to check (in order):

1. **Stale `_tabDrag` / stage `captured-event`** still STOP’ing after a prior tab press (event-owner residue)
2. **Tab decoration / chrome host** covering the CSD hit target so Meta never gets a move grab (user thinks they’re on the titlebar)
3. Grab begins but **drop always no-ops** / zones hidden (`preview-hint` / mod mask — host has `preview-hint-enabled=false`, `mod-mask-mouse-tile=None`; titlebar path must still commit when mod is None)
4. `_handleMoving` / origin-strip logic incorrectly treating titlebar grabs like tab peels

### Fix direction

- Smallest fix that restores **titlebar → GRAB_TILE → moveWindowToPointer → execute** for tabbed leaves
- Add L0 regression: “WINDOW in TABBED, simulated grab-op move onto foreign TILE, structure changes”
- Nest eyes-on after install

Do **not** break chip reorder/peel (PR15 / event-owner invariants).

---

## Implementation order

1. **Slice 0** probe (short) → decide fail-open vs live mins  
2. **Slice 1** theme + invalid CSS (safe, visible)  
3. **Slice 2** pure gate + wiring + L0  
4. **Slice 3** titlebar diagnose → fix → L0 + nest  

## Out of scope

- Forcing Mutter/clients below their min (`override_constraints` proven ineffective for Nautilus)
- Per-app `windows.json` min overrides (nice follow-up)
- Auto-convert overflow targets to TABBED instead of refuse (different product)
- Full Appearance prefs redesign beyond wiring the new invalid selector

## Verify

```bash
# L0 (adjust to touched files)
npm test -- tests/unit/extension/drop-intent.test.js \
  tests/unit/window/WindowManager-drag-drop*.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js

./install --kit=vim
./scripts/forge/forge-test nested run --monitors=1 -- bash -lc '
  # titlebar peel smoke + optional mins paint if reader works
  true
'
./scripts/forge/forge-test nested status   # running: False
```

Host eyes-on after tip load: drag Nautilus toward a too-short VSPLIT zone → **invalid red** + snap back; titlebar-drag a tabbed app onto a sibling → slots as before.

## Success criteria

- Blocked hover is **visibly distinct** (floated red invalid) from valid edge (purple tiled)
- Release on blocked zone **does not** reparent/split
- Tab join blocked only when **shared pane** &lt; dragged mins
- Titlebar peel from TABBED works again without regressing tab-chip DnD
- Contracts updated; L0 green; nest stopped after smoke
