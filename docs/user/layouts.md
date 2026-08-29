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
- New windows inherit the focused container's split. The **third** tiled
  window splits the focused slot in half (a nested pair), not an even
  three-way across the monitor. The wrap follows the slot's shape
  (taller than wide → stacked; otherwise side-by-side). Equal 3-way
  only after you resize those siblings or run **reset sizes**
  (`window-reset-sizes`). Reset-sizes equalizes the **current** split
  (and its parent); it does not flatten a nest into three columns.
- Enable **Auto Split / Quarter Tiling** (`auto-split-enabled`, off by
  default) to alternate the split direction automatically based on the
  focused pane's shape (1-child orientation toggle).

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
layout-profile bare arrays (`["app1", "app2"]`), and merge-group all prefer
tabs. Stacks are available; they are not the ambient default.

**Mark 2:** `toggleTabStack` (`con-stack-tab-layout-toggle`) flips TABBED ↔
STACKED, or turns a split TABBED. Settings still gate tab/stack modes.

### Creating / reshaping groups from the keyboard

| Goal | Safe | Vim / i3 |
| --- | --- | --- |
| Flip tab ↔ stack on current group | `Ctrl+Super+g` | Vim: `Super+n` · i3: `Shift+Super+n` |
| Merge focus + last-active → tabbed group | `Ctrl+Super+m` | `Shift+Super+m` |
| Promote (ungroup parent container) | `Ctrl+Shift+Super+m` | Vim: `Super+{` · i3: `Ctrl+Shift+Super+m` |
| Focus parent / child | `Ctrl+Super+a` / `Ctrl+Shift+Super+a` | Vim: `Super+p` / `Shift+Super+p` · i3: `Super+a` / `Shift+Super+a` |
| Move in / out of container | `Ctrl+Super+,` / `Ctrl+Shift+Super+,` | `Shift+Super+,` / `Ctrl+Shift+Super+,` |
| Make parent tabbed / back to split | `Ctrl+Super+t` | `Shift+Super+t` (i3: `Super+w`) |
| H ↔ V split orientation | `Ctrl+Super+s` | Vim: `Super+m` · i3: `Super+e` |
| Center-drop onto another window | DnD center (default **tabbed**) | same |

CLI / DBus parity (RunSteps): `layout-cycle` (`axis: group|split`),
`merge-group` / `group`, `ungroup`, `focus-parent` / `focus-child`,
`move-in` / `move-out`, `float` (`scope: window|class`), plus absolute
`layout`.

**Move in** reparents the focused layout unit into a sibling container;
**move out** peels it to the grandparent. Directional move/join still move
within a parent.

### Layout profiles (sugar)

| Form | Result |
| --- | --- |
| Bare multi-app array `["app1", "app2"]` | **Tabbed** group |
| `{ "layout": "stacked", "content": ["app1", "app2"] }` | **Stacked** group |
| IR `layout: "stacked"` on a multi-role leaf | **Stacked** |

`forge layout save` emits object form for live STACKED groups so they round-trip
(with optional `"active"` for the open leaf, and top-level `"focus"` for keyboard focus)
(not bare-array tab sugar).

**Validation:** `forge layout show` / apply refuse float/ignore-class apps (e.g. Guake)
baked into `tiles`, surface unknown role keys, and warn on vinyl-style flat
`[app, {hsplit:…}]` that loads as one monitor — dual-mon needs
`[[mon0…],[mon1…]]` (e.g. `[["inkscape"],[{"hsplit":["ghostty","YouTube"]}]]`).
Put floats under `floating[]` via `forge layout save --keep-floats`.

Other settings:

- Turn a mode off and its toggle shortcut does nothing.
- `auto-exit-tabbed` (on by default) drops a container back to a split when only one
  tab remains.
- `default-window-layout` (`tiled` | `tabbed` | `stacked`) sets the layout a newly
  *split* container starts in.

### Tab strip drag (Chrome-like)

Drag a **tab label** (not the close control):

1. **Click** (no real travel) — switches to that tab only.
1. **Drag along the strip** — the tab floats under the pointer; siblings
   slide and leave a gap where it will land. Release commits the new order
   in that group.
1. **Drag off the strip** onto the desk — peels that window into normal
   tile drag (center join, edge split, empty monitor), same as dragging a
   titlebar.
1. Drag onto **another group’s** tab bar to insert into that group at the
   gap (groups stay on one monitor).

Tabbed bars can **wrap** into multiple rows when labels would get too
narrow. Preferences → Appearance:

| Setting | Default | Meaning |
| --- | --- | --- |
| `min-tab-label-chars` | **12** | Width-wrap when equal-fill tabs would show fewer characters (`0` = width wrap off) |
| `max-tabs-per-line` | `0` | Cap labels per row (`0` = no count cap; with width wrap off → single row) |
| `max-tab-rows` | `0` | Hard row cap (`0` = unbounded; ≥1 shrinks tabs to fit) |

Stacked groups use a vertical title column; the same drag rules apply along
that column.

## Snap / quarter presets

Snap the focused window to a region without restructuring the tree (defaults use
`Ctrl+Alt`):

- Halves/thirds: snap 1/3 and 2/3 left/right (e.g. `Ctrl+Alt+d` = 1/3 left).
- **Center** — `Ctrl+Alt+c`.

## Tile sizes

Splits share space by **percentage**. Until you resize a tile, siblings stay
**equal**. After you resize with the mouse, keyboard expand/shrink, or golden
ratio, those tiles keep your proportions when new windows open (default).

**Resize vs Window Size:** edge `window-resize-*` grows/shrinks **one side** on
the owning split (mouse edge-drag and keyboard y/u/i/o). Expand / shrink /
golden (`[`/`]` family) are **Window Size** — both axes via owning-split steps.
Cheatsheet categories match that split.

**Named layouts** (`forge layout save` / load) remember custom shares as
`"share": [0.67, 0.33]` on `{ "hsplit" | "vsplit": … }` when any sibling was
user-resized. Equal desks stay bare lists. Install/update session restore also
keeps `percent` + `userSized` on the tree. See [layout.md](./layout.md).

| Action | Default |
| --- | --- |
| Reset sibling sizes to equal | `Ctrl+Super+=` (`window-reset-sizes`; Vim: `Super+=`) |
| Expand / shrink | Safe: `Ctrl+Super+]` / `[` · Vim/i3: `Super+]` / `[` |
| Golden-ratio resize | unbound by default (`window-golden-ratio`) |
| Edge resize (grow / shrink) | `Ctrl+Super` y/u/i/o + Shift twins (all kits) |

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

Drag a window **titlebar** (or a tab peeled off its strip) over another and
Forge shows a **preview hint** (left / right / top / bottom / center) of
where it will land; drop to tile it there. A center drop creates a tabbed or
stacked container (`dnd-center-layout`, default `tabbed`). With stack mode
off, center drop is forced to **tabbed** regardless of that setting. Whether
you must hold a modifier while dragging is set by the drag mask — see
[keybindings.md](keybindings.md#drag-to-tile).

**Tab labels** use the Chrome-like strip gesture above (float + gap), not the
five-zone tile preview, while the pointer stays over a tab bar.

**Empty monitor:** drag a tile onto another monitor’s empty work area (no window
under the pointer) and release — the window rehomes onto that monitor (same
attach policy as keyboard mon-move: after last tile on that mon when present,
else monitor root). Dropping into empty space on the *same* monitor is a no-op.
