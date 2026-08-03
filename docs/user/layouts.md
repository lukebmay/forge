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

### Reading nested splits (split chrome)

Forge draws a thin **split direction hint** (yellow edge: right for H-split,
bottom for V-split) using the same language as the focus border
(`.window-split-border`). Modes:

| Mode | Behavior |
| --- | --- |
| **Focus ancestry** (default) | H/V indicators for every split container on the focused unit’s parent chain (so a nest shows both axes) |
| **Show all** | Indicators on every H/V split on the monitor (`split-chrome-show-all`, prefs Appearance, or keybind `split-chrome-show-all-toggle` — unbound by default) |
| **While dragging** | Temporarily forces show-all for the grab, then restores your setting |

Requires `split-border-toggle` and `focus-border-toggle` (both on by default).

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

**Group chrome cycle** only flips an **existing** tab/stack container
(window-leaf bag). It does **not** groupify an H/V split — use **merge** /
**ungroup** for structure.

### Creating / reshaping groups from the keyboard

| Goal | Safe | Vim | i3 |
| --- | --- | --- | --- |
| Flip tab ↔ stack on current group | `Ctrl+Super+g` | `Shift+Super+n` | `Shift+Super+n` |
| Merge focus + last-active → tabbed group | `Ctrl+Super+m` | `Shift+Super+m` | `Shift+Super+m` |
| Ungroup (dissolve nearest parent CON one level) | `Ctrl+Shift+Super+m` | `Ctrl+Shift+Super+m` | `Ctrl+Shift+Super+m` |
| Focus parent CON (attach for open/split) | unbound | unbound | `Super+a` |
| Focus child of attach/parent CON | unbound | unbound | unbound |
| Move unit out one level (parent CON stays) | unbound | unbound | unbound |
| Move unit into adjacent sibling CON | unbound | unbound | unbound |
| Show-all split chrome | unbound | unbound | unbound |
| Make parent tabbed / back to split (mode only) | `Ctrl+Super+t` | `Shift+Super+t` | `Super+w` |
| H ↔ V split orientation | `Ctrl+Super+s` | `Ctrl+Super+n` | `Super+e` |
| Center-drop onto another window | DnD center (default **tabbed**) | same | same |

**Group** invents structure: merge (or DnD center) wraps two windows into a
tabbed CON (or flips a two-window split in place). **Ungroup** is the only
keyboard op that **dissolves** a CON: it lifts that container’s children into
the grandparent and removes the empty CON. Nested child CONs stay containers
(one level per press). Layout mode toggles (tab/stack/H/V) do **not** ungroup.

**Focus parent / child** (i3 `$mod+a` class) elevate or descend the **ops
target** (container selection) for open/split attach without the debug overlay.
When elevated, a distinct **selection bag** border paints the full CON rect;
the focus border stays on the focused window. **Clear selection** snaps the
target back to the focused leaf (Meta focus change to another window does the
same). **Move-out** lifts the focused window one level (former parent CON stays
with remaining siblings). After **focus parent**, move-out lifts that selected
CON instead. **Move-in** reparents into an adjacent sibling CON (next, else
previous); no sibling CON → no-op (does not invent structure).

CLI / DBus parity (RunSteps): `layout-cycle` (`axis: group|split`),
`merge-group` / `group`, `ungroup`, `focus-parent`, `focus-child`,
`clear-selection`, `move-out`, `move-in`, `float` (`scope: window|class`), plus
absolute `layout`.

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
- `auto-exit-tabbed` (on by default) switches a single-child tab/stack CON to a
  **split layout mode** when only one tab remains — it does **not** dissolve the
  CON (use **ungroup** for that).
- `default-window-layout` (`tiled` | `tabbed` | `stacked`) sets the layout a newly
  *split* container starts in.

## Snap / quarter presets

Snap the focused window to a region without restructuring the tree (defaults use
`Ctrl+Alt`):

- Halves/thirds: snap 1/3 and 2/3 left/right (e.g. `Ctrl+Alt+d` = 1/3 left).
- **Center** — `Ctrl+Alt+c`.

## Tile sizes

Splits share space by **percentage**. Until you resize a tile, siblings stay
**equal**. After you resize with the mouse, keyboard edge/expand/shrink, or
golden ratio, those tiles keep your proportions when new windows open (default).

**Resize is pair-only:** grow/shrink and edge keys debit only the **pair** in the
owning split (the next tiled sibling, or the previous if you are last) — other
siblings keep their shares. To resize against many windows as one unit, **group**
them into a container first; children re-layout proportionally inside the bag.
Use **equalize sibling tile shares** (`window-reset-sizes`) when you want equal
shares again on the whole parent.

**Layout mode toggles** (tab ↔ split, stack ↔ split, H ↔ V orientation, and the
absolute `layout` / `layout-cycle` CLI ops) change only the container’s layout
mode. Nested groups stay nested, and sibling percentages are **not** reset.

**Named layouts** (`forge layout save` / load) remember custom shares as
`"share": [0.67, 0.33]` on `{ "hsplit" | "vsplit": … }` when any sibling was
user-resized. Equal desks stay bare lists. Install/update session restore also
keeps `percent` + `userSized` on the tree. See [layout.md](./layout.md).

| Action | Default |
| --- | --- |
| Equalize sibling tile shares | `Ctrl+Super+=` (`window-reset-sizes`; Vim: `Super+=`) |
| Expand / shrink tile share (both axes) | `Ctrl+Super+]` / `[` (`window-expand` / `window-shrink`) |
| Golden-ratio tile share | unbound by default (`window-golden-ratio`) |

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
