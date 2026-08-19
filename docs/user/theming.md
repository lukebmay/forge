# Theming & appearance

Most appearance options — border size/color/radius, gaps, margins, tab decoration —
are in **Preferences → Appearance**, no CSS required. For finer control you can
override Forge's stylesheet.

## Preferences

Appearance settings (focus-hint borders, gaps, screen-edge margins, tab margins)
update live. When you change a focus-hint **color or size**, it propagates
everywhere that hint is drawn: the tiled/stacked/tabbed window borders, the drag
**preview hints**, and the overview / workspace-thumbnail hints. Each hint group
has a **Reset** that **clears your override** so the bundled default shows again
(not a sticky copy of the default into your file).

## Gaps

- `window-gap-size` (default 4) — space between tiled windows; adjustable live with
  the gap inc/dec shortcuts (`window-gap-size-increment` is the step).
- `window-gap-hidden-on-single` — hide the gap when a workspace has one window.
- `window-margin-{top,bottom,left,right}` — reserve screen-edge space for panels/docks.

## How stylesheets layer

| Layer | Path | Role |
| --- | --- | --- |
| **Base** | extension `stylesheet.css` (bundled) | Always loaded first — structure + default colors |
| **User** | `~/.config/forge/stylesheet/forge/stylesheet.css` | Loaded second — **overrides only** (cascade wins) |

New installs seed the user file with a short comment (`/* forge user overrides */`),
**not** a full copy of the default theme. Preferences write **only properties you
change**. On save, rules that still match the base sheet are stripped so full-fork
files from older Forge shrink toward true deltas.

### Live reload

Edit the user file or use Appearance, then:

- **`Super+Shift+r`** (config reload), or
- `./scripts/forge/reload-theme.zsh` (bumps `css-updated`; no reboot)

A full computer restart is **not** required. On X11, if Shell still shows stock
borders after a code reinstall, `Alt+F2` → `r` (or `make dev` then
`reload-theme.zsh`).

### Upgrades

`patchCss` / `css-last-update` may stamp a CSS version or rename known selectors.
It does **not** overwrite your user stylesheet with bundled defaults. (Older Forge
did full-file reseeds; that footgun is gone.)

Restore colors from a backup if needed:

```bash
./scripts/forge/restore-theme.zsh [backup-dir]
./scripts/forge/reload-theme.zsh
```

### Selectors (see bundled `stylesheet.css` for the full set)

| Selector | What it styles |
| --- | --- |
| `.window-tiled-border` | Border of a tiled window |
| `.window-stacked-border` / `.window-tabbed-border` | Stacked / tabbed container border |
| `.window-floated-border` | Floating-window border |
| `.window-tabbed-tab`, `.window-tabbed-tab-active`, `.window-tabbed-tab-icon`, `.window-tabbed-tab-close` | Tab strip elements |
| `.window-tilepreview-tiled` / `-stacked` / `-tabbed` / `-swap` / `-zoomed` | Drag/drop preview hints |
| `.window-tilepreview-invalid` | Drop refused (app min size would overflow the slot) |
| `.tiled`, `.stacked`, `.tabbed`, `.floated` | Palette classes (color/opacity) |

Border width, color, radius, and opacity are plain CSS properties; colors accept
`rgba(...)` or hex. Prefer only the rules you customize — the base supplies the rest.

> Advanced: the CSS parser and `ThemeManagerBase` API live in `lib/css/` and
> `lib/shared/theme.js` (see [dev/rendering.md](../dev/rendering.md)). Design
> decision: [docs/DECISIONS.md](../DECISIONS.md) D001.
