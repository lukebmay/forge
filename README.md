# Forge

[![CI](https://github.com/jcrussell/forge/actions/workflows/testing.yml/badge.svg)](https://github.com/jcrussell/forge/actions/workflows/testing.yml)

**Forge** is a GNOME Shell extension that brings i3/sway-style tiling window
management to GNOME. This repository ([lukebmay/forge](https://github.com/lukebmay/forge))
is a product fork focused on multi-monitor reliability, tabbed layouts, a
`forge` control CLI, and a daily-driver workflow.

Works on **GNOME 45+** (X11 and Wayland). Extension UUID:
`forge@jmmaranan.com` (same as upstream — installs **replace** each other in
place).

Thanks to [@jmmaranan](https://github.com/jmmaranan), [@jcrussell](https://github.com/jcrussell),
and all original contributors.

---

## Lineage

| Layer | Repository | Role |
| --- | --- | --- |
| **Upstream (EGO)** | [forge-ext/forge](https://github.com/forge-ext/forge) | Original Forge; listed on extensions.gnome.org |
| **Community base** | [jcrussell/forge](https://github.com/jcrussell/forge) | AI-maintained fork with tests, prefs, and many fixes |
| **This project** | [lukebmay/forge](https://github.com/lukebmay/forge) | Product work on the jcrussell base (`master` branch) |

Upstream EGO is lightly maintained and has sought a new maintainer. The
community fork is the better code base for modern GNOME; this tree builds on
that base for reliability and scripting.

Pull community updates with the `upstream` remote (`upstream/main`); day-to-day
development and installs stay on **this** repo.

---

## Features

### Core (from original Forge)

- Tree-based tiling with horizontal and vertical splits (i3/sway-like)
- Vim-style navigation, swap, and move keybindings
- Drag-and-drop tiling with preview hints
- Floating windows, smart gaps, and focus borders
- Stacked and tabbed container layouts; workspace monocle
- Per-workspace tiling; multi-monitor support
- Window resize via keyboard; auto-split / quarter tiling
- Customizable shortcuts in extension preferences

### From the community base (jcrussell)

Improvements that land in this tree via the jcrussell lineage:

**Features**

- Keybindings cheatsheet overlay
- Portable config sync (export/import settings and keybindings)
- Arrow-key navigation alongside hjkl
- Floating window rules UI in preferences
- Screen edge margins (panels/docks)
- Extra bindings: config reload, evenly distribute, workspace monocle, …
- More appearance options (border radius, tab margins, gap limits, default layout)
- Monitor exclusion from tiling

**Bug fixes**

- Resize and focus navigation reliability
- App-specific fixes (Chrome, Brave, Steam, Blender, ddterm, …)
- Stacked/tabbed container behavior
- Preview hints and border rendering
- Cross-workspace window operations
- Preferences save and theme handling

**Engineering**

- Large unit-test suite (1,600+ tests) and Dockerized E2E
- Refactored managers and clearer architecture
  ([docs/dev/architecture.md](docs/dev/architecture.md))
- Riskier options behind experimental toggles

### Added in this project (lukebmay/forge)

Product work aimed at surviving real multi-monitor sessions and scripting the desk:

| Area | What & why |
| --- | --- |
| **Monitor-recovery** | After lock/blank/wake, workarea thrash no longer piles all tiles onto the primary monitor. Debounced rehome from last-known geometry. |
| **Session layout** | Last-good tree snapshot (`session-layout.json`) so install/HUP reload can restore splits and tabs instead of flattening to columns. |
| **Tab chrome** | Tab/stack labels always show for every window in the group (no empty gap when `Shell.App` is missing). |
| **Tab-first groups** | Stack mode **on** (available); **tabbed** remains the default group type for DnD center, bare-array sugar, and merge-group. |
| **Sizing policy** | Equal shares until you resize; preserve vs equalize when a new window joins. |
| **Keybind kits** | Safe defaults (no bare Super+letter grabs); vim/i3 kits; conflict scan; save your own kit. |
| **Open-app placement** | Last Focused Tile (LFT) attach; dock-sticky monitor; optional tiny-pane → tab fallback. |
| **Layout debug overlay** | Opt-in labels for layout type, percent, and mon-ws id (`Ctrl+Super+d`). |
| **`forge` CLI** | DBus control plane: tree, focus, swap, move, launch, settings, session-layout flush. |
| **`forge layout`** | Named layout profiles — idempotent reconcile (open gaps, move mismatches, leave companions). |
| **Durable CLI jobs** | Mutating commands (layout apply, install, …) outlive terminal close by default; `forge jobs` to list/attach/cancel. |
| **Install tooling** | `./install` + `forge install` / `update` / `uninstall`; settings-safe migrate from EGO. |

**Long first layout apply:** The first time Forge applies a full desk layout
(especially after login or with apps closed), it may take a while. That is
intentional: Forge waits for windows to really appear and settle, and learns how
long your apps need, so it does not yank them around early or leave a half-built
desk. Later applies are usually much faster. Closing the terminal during apply
no longer aborts the job — work continues in the background; check with
`forge jobs`.

---

## Getting started

### Requirements

- GNOME Shell **45+**
- To build from source: **Node.js 20+**, `npm`, `make`, gettext (`msgfmt`),
  `glib-compile-schemas`

### Install from this repository

```bash
git clone https://github.com/lukebmay/forge.git
cd forge
./install
```

Install/update also **disables other GNOME Shell tiling extensions** (Ubuntu
Tiling Assistant, Pop Shell, PaperWM, Tiling Shell, gTile, …) so they cannot
fight Forge. Session WMs such as **i3/sway are not touched** — they are not
Shell extensions.

That builds the extension, installs it under
`~/.local/share/gnome-shell/extensions/forge@jmmaranan.com`, enables it, puts
the **`forge`** CLI on `~/.local/bin/forge`, and reloads GNOME Shell on X11.

```bash
# after install (ensure ~/.local/bin is on PATH)
forge ping
forge tree
forge help
forge layout mydesk          # durable by default (survives closing the terminal)
forge layout mydesk --detach # fire-and-forget; then: forge jobs
forge jobs                   # list / status / attach / cancel / log
```

**Already on extensions.gnome.org Forge?** `./install` migrates with an automatic
settings backup (dconf + `~/.config/forge`). Prefs and keybindings are kept when
the schemas allow.

**Daily reinstall after pulling code:**

```bash
git pull
forge install          # or: ./install
# or: forge update     # clean master: fetch → pull if new → always install
```

**Remove (keeps prefs):**

```bash
forge uninstall
# wipe config too:
forge uninstall --purge-config
```

### Other install options

| Method | Status |
| --- | --- |
| extensions.gnome.org | This fork is **not** published there yet |
| Pre-built zip from community releases | [jcrussell/forge releases](https://github.com/jcrussell/forge/releases) (community base, not this product tree) |
| `make dev` / `make prod` | Developer install — see [CONTRIBUTING.md](CONTRIBUTING.md) |

After any install that does not reload Shell: on **X11** use `Alt+F2` → `r`, or
`killall -HUP gnome-shell`; on **Wayland**, log out and back in.

![Forge tiling screenshot](https://user-images.githubusercontent.com/348125/146386593-8f53ea8b-2cf3-4d44-a613-bbcaf89f9d4a.png)

---

## Using Forge

### In-session basics

- **Cheatsheet:** Safe kit default `Ctrl+Super+/` (Vim kit: `Super+Shift+/`)
- **Reload config / theme:** `Super+Shift+r` (or your kit’s reload chord)
- **Group chrome (tab ↔ stack):** Safe `Ctrl+Super+g` · Vim `Shift+Super+n`
- **Merge into tabbed group:** Safe `Ctrl+Super+m` · Vim `Shift+Super+m`
- **Layout debug overlay:** `Ctrl+Super+d`
- **Preferences:** Extensions app → Forge, or `gnome-extensions prefs forge@jmmaranan.com`
- **Keybind kits CLI:** `forge keybind apply vim` (also `safe` / `i3`; backup/list)

User guide:

| Topic | Doc |
| --- | --- |
| Layouts & tiling | [docs/user/layouts.md](docs/user/layouts.md) |
| Keybindings | [docs/user/keybindings.md](docs/user/keybindings.md) |
| Theming | [docs/user/theming.md](docs/user/theming.md) |
| Window rules | [docs/user/rules.md](docs/user/rules.md) |
| Portable config | [docs/user/config.md](docs/user/config.md) |
| Multi-monitor | [docs/user/monitors.md](docs/user/monitors.md) |
| Layout profiles | [docs/user/layout.md](docs/user/layout.md) |
| Troubleshooting | [docs/user/troubleshooting.md](docs/user/troubleshooting.md) |

### Control CLI (`forge`)

Talks to the **enabled** extension over DBus. Install also places it at
`~/.local/bin/forge`.

```bash
forge help
forge tree                              # tiling forest (JSON)
forge tree --monitor=0 --compact
forge focus 'class:firefox'
forge launch nautilus                   # resolve .desktop + place after LFT
forge launch ghostty --monitor=1
forge launch nautilus --path=mo1ws0/1/1

# Named layout profiles
forge layout help
forge layout list
forge layout save mydesk
forge layout mydesk --dry-run
forge layout mydesk

# Install helpers (no DBus)
forge install
forge update
forge uninstall
```

Full install/migrate script reference: [scripts/forge/README.md](scripts/forge/README.md).

### Config paths

| What | Where |
| --- | --- |
| Window rules | `~/.config/forge/config/windows.json` |
| User stylesheet | `~/.config/forge/stylesheet/forge/stylesheet.css` |
| Layout profiles | `<tree>/hosts/<host>/<name>.json` (`FORGE_LAYOUT_DIR` or `~/.config/forge/layout`) |
| Session layout snapshot | `~/.config/forge/config/session-layout.json` |
| Install origin stamp | `~/.local/share/forge-manage/install-origin.json` |
| Settings backups | `~/.local/share/forge-manage/backups/` |

GNOME still owns workspaces. Bind workspace switch/move in GNOME Settings as you
prefer; Forge does not replace that.

---

## Known limitations

- No dynamic workspaces
- Limited vertical-monitor support
- Multi-monitor blank/wake is much more robust than stock, but edge thrash cases
  can still need a config reload (`Super+Shift+r`) or a retab
- Stack mode is **off by default** (tab-first; enable in prefs if you want it)

---

## Documentation map

| Need | Where |
| --- | --- |
| This overview + install | [README.md](README.md) (you are here) |
| User behavior | [docs/user/](docs/user/) |
| Architecture / Mutter / render | [docs/dev/](docs/dev/) |
| Design “why” | [docs/DESIGN.md](docs/DESIGN.md) |
| Build, test, contribute | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Install scripts | [scripts/forge/README.md](scripts/forge/README.md) |
| Unit / E2E tests | [tests/README.md](tests/README.md), [tests/e2e/README.md](tests/e2e/README.md) |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Branch off `master`. Prefer small, tested
patches (`npm test` / `make unit-test`).

Issues for **this** fork: <https://github.com/lukebmay/forge/issues>  
Community base: <https://github.com/jcrussell/forge/issues>  
Original project discussion on maintainership:
[forge-ext discussion #501](https://github.com/orgs/forge-ext/discussions/501).

---

## Credits

- **Original Forge** — [@jmmaranan](https://github.com/jmmaranan) and
  [upstream contributors](https://github.com/forge-ext/forge)
- **Community fork** — [@jcrussell](https://github.com/jcrussell) and contributors
- Michael Stapelberg / i3; System76 / pop-shell; ReworkCSS css-parse/stringify
