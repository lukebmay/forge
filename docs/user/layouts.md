# Layouts: how tiling works

Forge arranges each workspace's windows in a **tree** of containers, like i3/sway.
Every container arranges its children in one of a few **layouts**; you reshape the
tree with keyboard shortcuts (or drag-and-drop). Default chords are shown below —
press **`Super+Shift+/`** any time to open the in-app cheatsheet with your current
bindings, and see [keybindings.md](keybindings.md) to customize them.

## Splits (the default)

New windows tile side-by-side. A container is either a **horizontal split**
(windows left-to-right) or a **vertical split** (stacked top-to-bottom).

- **Toggle a container's split direction (H ↔ V)** — Safe default `Ctrl+Super+s`
  (Vim kit: `Ctrl+Super+n`). Use the cheatsheet for your live chord.
- Splits **nest**: split one pane vertically while its parent stays horizontal, and
  you get an L-shaped layout. This is how complex layouts are built.
- New windows inherit the focused container's split. Enable **Auto Split /
  Quarter Tiling** (`auto-split-enabled`, off by default) to alternate the split
  direction automatically based on the focused pane's shape.

## Stacked and tabbed

Instead of splitting space, a container can show one child at a time.

### Stacked vs tabbed

| | **Tabbed** | **Stacked** |
| --- | --- | --- |
| Chrome | Horizontal tab strip (default daily path) | Vertical title-bar column (i3-like) |
| Group chrome cycle | Safe: `Ctrl+Super+g` · Vim: `Shift+Super+n` | same (TABBED ↔ STACKED) |
| Toggle to/from split | Safe: `Ctrl+Super+t` (tabbed) | Vim/i3 still have dedicated stack binds |
| Mode flag | `tabbed-tiling-mode-enabled` — **on** | `stacked-tiling-mode-enabled` — **on** |

**Tabbed** is the default **group** type: center-drop (`dnd-center-layout`),
layout-profile bare arrays (`["app1", "app2"]`), merge-group, and monocle all
prefer tabs. Stacks are available; they are not the ambient default.

**Phase 1:** group chrome cycle only flips an **existing** tab/stack container
(window-leaf bag). It does **not** groupify an H/V split (that path dissolves
nested structure and is deferred).

### Creating / reshaping groups from the keyboard

| Goal | Safe | Vim |
| --- | --- | --- |
| Flip tab ↔ stack on current group | `Ctrl+Super+g` | `Shift+Super+n` |
| Merge focus + last-active → tabbed group | `Ctrl+Super+m` | `Shift+Super+m` |
| Make parent tabbed / back to split | `Ctrl+Super+t` | `Shift+Super+t` |
| H ↔ V split orientation | `Ctrl+Super+s` | `Ctrl+Super+n` |
| Center-drop onto another window | DnD center (default **tabbed**) | same |

CLI / DBus parity (RunSteps): `layout-cycle` (`axis: group|split`),
`merge-group`, `float` (`scope: window|class`), plus absolute `layout`.

Move windows into or out of an existing group with the usual move/swap binds.

### Layout profiles (sugar)

| Form | Result |
| --- | --- |
| Bare multi-app array `["app1", "app2"]` | **Tabbed** group |
| `{ "layout": "stacked", "content": ["app1", "app2"] }` | **Stacked** group |
| IR `layout: "stacked"` on a multi-role leaf | **Stacked** |

`forge layout save` emits object form for live STACKED groups so they round-trip
(with optional `"active"` for the open leaf, and top-level `"focus"` for keyboard focus)
(not bare-array tab sugar).

Other settings:

- Turn a mode off and its toggle shortcut does nothing.
- `auto-exit-tabbed` (on by default) drops a container back to a split when only one
  tab remains.
- `default-window-layout` (`tiled` | `tabbed` | `stacked`) sets the layout a newly
  *split* container starts in.

## Monocle

Monocle gathers **all** of the workspace's tiled windows into a single **tabbed**
container — you see one window at a time and switch with the tab strip, a focus mode
for a busy workspace. Toggle again to return to your previous split layout. Bind it
yourself: **`workspace-monocle-toggle` has no default chord** (set one in
Preferences → Keyboard).

## Snap / quarter presets

Snap the focused window to a region without restructuring the tree (defaults use
`Ctrl+Alt`):

- Halves/thirds: snap 1/3 and 2/3 left/right (e.g. `Ctrl+Alt+d` = 1/3 left).
- **Center** — `Ctrl+Alt+c`.

## Tile sizes

Splits share space by **percentage**. Until you resize a tile, siblings stay
**equal**. After you resize with the mouse, keyboard expand/shrink, or golden
ratio, those tiles keep your proportions when new windows open (default).

**Named layouts** (`forge layout save` / load) remember custom shares as
`"share": [0.67, 0.33]` on `{ "hsplit" | "vsplit": … }` when any sibling was
user-resized. Equal desks stay bare lists. Install/update session restore also
keeps `percent` + `userSized` on the tree. See [layout.md](./layout.md).

| Action | Default |
| --- | --- |
| Reset sibling sizes to equal | `Ctrl+Super+=` (`window-reset-sizes`; Vim: `Super+=`) |
| Golden-ratio resize | unbound by default (`window-golden-ratio`) |

**New window size** (Preferences → Tiling → Behavior, `new-window-size-policy`):

- **Preserve resized proportions** (default) — after you have resized tiles, a
  new window gets `1/(n+1)` and the others scale down, keeping their ratio.
- **Equalize all tiles** — every new window re-equalizes the whole parent split.

Until *any* sibling has been user-resized, new windows always equalize (automatic
percents from min-size layout do not count as “you resized”).

## Float vs tile

Any window can be pulled out of the tree to **float**, or floated for its whole app
class, via the [float toggles](keybindings.md#common-defaults). Some apps float
automatically; you control this per-app with [window rules](rules.md). A floating
window keeps its place in the tree and re-tiles when you toggle it back.

## Drag to tile

Drag a window over another and Forge shows a **preview hint** (left / right / top /
bottom / center) of where it will land; drop to tile it there. A center drop creates
a tabbed or stacked container (`dnd-center-layout`, default `tabbed`). With stack
mode off, center drop is forced to **tabbed** regardless of that setting. Whether
you must hold a modifier while dragging is set by the drag mask — see
[keybindings.md](keybindings.md#drag-to-tile).

**Empty monitor:** drag a tile onto another monitor’s empty work area (no window
under the pointer) and release — the window rehomes onto that monitor (same
attach policy as keyboard mon-move: after last tile on that mon when present,
else monitor root). Dropping into empty space on the *same* monitor is a no-op.
