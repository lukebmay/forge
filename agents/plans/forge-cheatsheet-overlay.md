# forge-cheatsheet-overlay — Fit the screen; interactive; Float in list

**Status:** CS0–CS2 done; CS3 parked
**Branch:** master
**Blocker:** [settings-overlay-design.md](../blockers/settings-overlay-design.md)
(soft — design meeting only; does **not** block CS0–CS2)
**Updated:** 2026-09-04
**Design:** In-shell cheatsheet (`Super+Shift+/` / kit toggle). Prefs
stay GTK until the **parked** overlay-settings meeting.

## Goal

The shortcuts overlay **fits the current monitor**, follows **aspect
ratio**, and remains usable when the list is long:

1. Interactive if the Shell widgets allow it (they do): **scroll** +
   **collapsible headings**.
1. Flow shortcut columns from the monitor AABB (landscape vs portrait /
  ultrawide), not a fixed two-column natural size that overflows.
1. **Float toggle** (`window-toggle-float`) is in the list whenever it
   has a bound chord.

Do **not** implement a settings overlay in this plan. Schedule a
design meeting only because interactivity is possible (soft blocker).

## Acceptance

- [x] Overlay preferred size ≤ current monitor workarea (minus a
      margin). Landscape vs a shorter/taller head both fit
- [x] Overflow: `St.ScrollView` (or equivalent) so leftover rows are
      reachable; mouse wheel + keyboard if focus is in the sheet
- [x] Category headings are `St.Button` (or similar) and collapse /
      expand their rows. Default: all expanded **or** first N
      expanded — pick one, unit-test the grouping helper
- [x] `window-toggle-float` appears under Window Toggle (schema
      summary “Toggle float”; kits: Safe/Vim `Alt+Super+Return`, i3
      `Shift+Super+Space`). Missing only if the user unbound it
- [x] Escape / click-outside / close button still dismiss (existing
      forge-0rb6 / forge-v3y3 behavior)
- [x] Rebuild overlay on show so kit/chord changes appear (destroy on
      hide already). Recenter + resize on `monitors-changed`
- [x] No settings/prefs UI in this overlay

## Context for the next agent (complete + succinct)

### Proven

- Pure helpers in `lib/shared/cheatsheet-layout.js` (no gi). Overlay
  widgets stay in `lib/extension/cheatsheet.js`
- Cap = 90% of current monitor **workarea** (geometry fallback).
  Cols: aspect `< 0.85` → 1; `≥ 2` → 3; else 2. `_recenter()` clamps
  + centers; `monitors-changed` re-clamps
- `St.ScrollView` (overlay scrollbars, v-auto / h-never) wraps
  columns. Page/arrow/Home/End scroll while overlay has key focus.
  No modal grab
- Headings are `St.Button`; click toggles row `visible`. Default:
  **all expanded** (`initialSectionExpanded`; `firstN` is tested)
- `window-toggle-float` was **not** filtered. Prefix `window-toggle`
  → Window Toggle. Schema summary “Toggle float”. Unbound (empty
  strv) omitted
- vitest excludes `cheatsheet.js` coverage. Widget dismiss tests
  still in `Cheatsheet.test.js` (St mock + ScrollView)

### Sketch

1. Cap overlay to `monitorGeom` (e.g. 90% width/height). Column
   count from aspect (wide → 2–3 cols; tall → 1 col + scroll).
1. Inner `St.ScrollView` { overlay-scrollbars or always } wrapping
   the column box.
1. Headings: `St.Button` toggles section `visible`.
1. Unit: grouping includes `window-toggle-float`; column-split helper
   given AABB → N cols; collapse state map.

Settings overlay (prefs pages → in-shell menu) is **out of scope**.
Soft blocker asks the human to schedule a design meeting.

### Paths

- `lib/extension/cheatsheet.js` — overlay build / recenter / show
- `lib/shared/keybind-presets.js` / schema
  `window-toggle-float` summary
- Tests: new `tests/unit/extension/cheatsheet-layout.test.js` for
  pure helpers (do not force St into vitest)
- User docs: `docs/user/keybindings.md` if behavior changes

### Implementation slices

| Slice | What | Exit |
| --- | --- | --- |
| **CS0** | Pure layout helper: AABB → cols + max size; tests | **done** |
| **CS1** | ScrollView + collapsible headings + recenter clamp | **done** |
| **CS2** | Assert Float toggle in grouped list when bound | **done** |
| **CS3** | Soft blocker already filed; do **not** implement settings UI | Meeting parked |

**Order:** CS0 → CS1 → CS2. After A/C/E/B. Parallel with vinyl (D)
if no nest conflict (this plan is unit + host overlay; nest optional).

## Do not

- Branch: **master**. No commit/push unless operator asks
- Invent `Mark2Drop*`. No Forest←GObject dual-write. No
  `live-handle.js` growth
- Do not skip ROOT `move*`. Do not relocate dual-write into
  tree-api-nav
- Do not patch-only `computeSizes`. Do not ship whole-forest
  `MON_MISMATCH` RESYNC
- Do not reintroduce raw `move_to_monitor` at map. Do not port belt /
  Mode B / title→`renderTree` / entered-monitor maze
- Nest: `./scripts/forge/forge-test nested --trunk <id>` one CLI;
  hunt `forge-test nested log`; always stop nest. Agent does **not**
  host `layout`. Test layouts only `_forge-test-*`
- Install from `~/dev/me/forge` with `./install --dev` (TRACE)
- Proto brake: `cd prototypes/container-motion && npm test`
- Do **not** move prefs into the overlay in this plan
- Do not make the overlay modal-grab (keep Escape + global toggle)

## Enable / test

```text
npm test -- tests/unit/extension/cheatsheet-layout.test.js
cd ~/dev/me/forge && ./install --dev
# host: Super+Shift+/ (vim/i3) or Ctrl+Super+/ (safe) — sheet fits
```

## Session note

2026-09-04 — CS0–CS2 shipped on `master` (no commit). CS3 still
parked (`agents/blockers/settings-overlay-design.md`).

**Code:** `lib/shared/cheatsheet-layout.js` + `lib/extension/cheatsheet.js`.
St mock gained `ScrollView` / `PolicyType`. User note:
`docs/user/keybindings.md` (scroll + collapse).

**Layout:** 90% workarea; 1 / 2 / 3 cols by aspect (`<0.85` / else /
`≥2`). Collapse default = all expanded.

**Tests:** `cheatsheet-layout.test.js` **18**; `Cheatsheet.test.js`
**15** (dismiss + clamp + heading toggle). Together **33** green.
`npm test -- tests/unit/extension/cheatsheet-layout.test.js tests/unit/extension/Cheatsheet.test.js`

**Host leftover:** after `./install --dev` + **logout** if tip not
loaded: Safe `Ctrl+Super+/`, Vim/i3 `Super+Shift+/`. Confirm sheet
fits, scroll/collapse, Float under Window Toggle, Escape /
click-outside / close still work. No nest this slice.
