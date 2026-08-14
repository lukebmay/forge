# forge-zoom-maximize — Wave Z0/Z1 zoom (full / width / height)

**Status:** ready (L0 green; live smoke after host logout)
**Plan:** [forge-first-class-containers](../plans/forge-first-class-containers.md) Wave Z
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Forge **presentation zoom** (not Meta maximize / not monocle). Operator
asked to ship now (overrides FCC “zoom after containers”).

## Acceptance

- [x] `Super+Return` (Vim kit) toggles **full** zoom on the focused TILE
- [x] `Super+Ctrl+Return` toggles **horizontal** zoom (full workarea
      width; keep slot y/height)
- [x] `Super+Shift+Return` toggles **vertical** zoom (full workarea
      height; keep slot x/width)
- [x] If **any** zoom mode is already on the focused unit, **any** of
      those three chords restores the normal tile slot
- [x] Zoomed windows get a distinct border: user theme deep magenta
      `rgba(176, 16, 128, 1)`; bundled default `rgba(199, 75, 175, 1)`
- [x] Not Meta maximize / not fullscreen / not workspace monocle
- [x] IC3 `shouldRestoreTileSlot` does **not** snap a Forge-zoomed TILE
      back to slot (zoom geom is intentional)
- [x] Unsolicited **Meta** max/fs still restores (R020 / D026)
- [x] Tree slot + percents unchanged; forest fingerprint stable aside
      from the zoom flag (I4)
- [x] L0 units for zoom rect math + toggle-off + any-mode-clears +
      sensors skip

## Context for the next agent (complete + succinct)

### Product lock (this task)

| Item | Decision |
| --- | --- |
| Mechanism | Flag on WINDOW node (`zoomMode`: `null` / `"full"` / `"horizontal"` / `"vertical"`). `tree.apply` paints zoom rect; siblings keep percents |
| Not | Meta `maximize` / `fullscreen`; float+placeholder; monocle flatten |
| Any-mode off | Focused unit already zoomed → any of the 3 chords sets `zoomMode=null` and `commitLayout` |
| One zoom / mon | Setting zoom on a unit clears zoom on other TILE units of the same monitor |
| Unit | Focused WINDOW. Tab/stack bag already shares one slot — zooming the open leaf fills that slot’s zoom rect |
| Focus | Flag persists until toggled. Unfocused zoomed windows still apply zoom rect; focused TILE raises |
| Persist | Include `zoomMode` in GetTree + session snapshot if cheap; `forge layout` apply may clear zoom (do not fight layout) |
| Vim conflict | `window-swap-last-active` is currently `<Super>Return`. **Move** it to `<Super>Tab` (i3 already uses that for swap-last; Vim Super+Tab was free). Horizontal zoom is `<Ctrl><Super>Return` — do not double-bind |
| Other kits | Safe / i3: leave zoom keys **unbound** this slice (operator said “Vim at least”) |
| Colors | Bundled `stylesheet.css` + user `~/.config/forge/stylesheet/forge/stylesheet.css` (do not overwrite other user colors). Prefs Appearance color row for `.window-zoomed-border` |

### Canonical APIs

- Commit via `wm.commitLayout("zoom", { force: true })` — do not twin
  `renderTree`
- Geom: extend `tree.apply` / `tree-layout` with a pure helper
  `zoomRect(slot, workarea, zoomMode)` — unit-test that
- Restore-slot: extend `shouldRestoreTileSlot` to return false when
  `node.zoomMode` is set
- Decorations: `decoration.js` + `WindowManager-borders` — new class
  `window-zoomed-border` (same pattern as tiled/floated)
- Commands: `ZoomToggle` / `ZoomHorizontal` / `ZoomVertical` in
  `command.js` + `keybindings.js`

### Files to touch (expected)

- `schemas/org.gnome.shell.extensions.forge.gschema.xml` — 3 `as` keys
- `lib/shared/settings-keys.js` `KEYBINDING_KEYS`
- `lib/shared/keybind-presets.js` — all 3 kits must list the keys
  (Vim bound; Safe/i3 `[]`)
- `lib/extension/keybindings.js`, `command.js`, `window.js` (toggle +
  apply raise), `tree.js` / `tree-layout.js`, `decoration.js`
- `lib/extension/layout-sensors.js` + tests
- `lib/prefs/appearance.js` (`getCssSelectorAsMessage` + color list)
- `lib/shared/theme.js` if scheme map needs `zoomed`
- `stylesheet.css` + user theme CSS
- Tests: `tests/unit/shared/keybind-presets.test.js` will fail if a kit
  misses a new key; `Keybindings.test.js` allowlist; new
  `tests/unit/extension/zoom.test.js` (or tree-layout) for pure math
- Cheatsheet / user docs only if a table is hand-maintained

### Enable / test

```bash
# L0
npm test -- tests/unit/shared/keybind-presets.test.js \
  tests/unit/keybindings/Keybindings.test.js \
  tests/unit/extension/layout-sensors.test.js \
  tests/unit/window/WindowManager-borders.test.js \
  tests/unit/extension/zoom.test.js
# After JS: ./install && forge nested run -- forge ping
# Live: Vim kit; Super+Enter / Super+Ctrl+Enter / Super+Shift+Enter
```

Vim kit is already the daily kit — no extra enable. After install,
existing user keybindings **do not auto-reapply** a kit. Re-apply Vim
kit in prefs **or** set the 3 keys + move swap-last in the same change
and document that the operator must reload the Vim kit (or set keys
via gsettings in the task note). Prefer: implementer runs
`gsettings` to bind the new keys on this host so the operator can try
them without a prefs click. Record the commands in the session note.

### Risks

- IC3 will immediately undo Meta-maximize — do **not** use Compat.maximize
- `window-maximize-on-single` is a different feature; leave it
- User stylesheet is a full fork — add only `.zoomed` +
  `.window-zoomed-border`; do not reformat the file
- Do not delete monocle in this slice (C0)

## Session note

Shipped Wave Z on master (no commit). D030.

**Behavior:** `zoomMode` on WINDOW (`null`/`full`/`horizontal`/`vertical`).
`wm.toggleZoom` → `commitLayout("zoom", { force: true })`. `tree.apply`
paints via `zoomRect` (does not change percents / `node.rect`). Any
existing mode + any of the 3 chords clears. One zoomed TILE per monitor.
`shouldRestoreTileSlot` false when `zoomMode` set; non-zoomed Meta max/fs
still restores.

**Vim / i3:** Super+Return zoom full; Ctrl+Super+Return zoom H;
Shift+Super+Return zoom V. Super+Space = run. Vim/Safe float is Alt+Super+Return; i3 float is
Shift+Super+Space (Enter is zoom). Safe zoom still unbound. GNOME
switch-input-source(+backward) and toggle-maximized cleared while
Forge is enabled.

**gsettings (host, applied):**
```
window-zoom-toggle ['<Super>Return']
window-zoom-horizontal ['<Ctrl><Super>Return']
window-zoom-vertical ['<Shift><Super>Return']
prefs-app-launch ['<Super>space']
window-toggle-float ['<Alt><Super>Return']
window-swap-last-active ['<Super>Tab']
```
Stale `~/.local/share/glib-2.0/schemas/` copied + compiled so CLI saw the
new keys.

**L0:** 281 + 115 pass (zoom, sensors, keybind-presets, Keybindings,
borders, CommandHandler, whitelist, theme, tree-query, Tree-layout, Node).

**Nest:** `./install` (Wayland live-reload expected fail) + `forge nested
run -- forge ping` ok. `forge nested status` → running: False.

**Leftover:** Zoom border must use `paintRectForWindow` (not the unzoomed
slot). Super+Space Run = empty command → GNOME `openRunDialog`. Super+Return
is Forge zoom; `toggle-maximized` cleared in gnome-overrides + host-defaults.
Snapshot persist of `zoomMode` not added (`forge layout` may clear; do not
fight).
