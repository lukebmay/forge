# Forge (jcrussell fork)

[![CI](https://github.com/jcrussell/forge/actions/workflows/testing.yml/badge.svg)](https://github.com/jcrussell/forge/actions/workflows/testing.yml)
[![codecov](https://codecov.io/github/jcrussell/forge/graph/badge.svg?token=MFNOBH5D4L)](https://codecov.io/github/jcrussell/forge)

An actively maintained fork of [Forge](https://github.com/forge-ext/forge), the
GNOME Shell extension that provides i3/sway-style tiling window management.

This fork addresses bugs and adds features while the upstream project seeks a
new maintainer. Contributions here are intended to be upstreamed when possible.
Thanks to [@jmmaranan](https://github.com/jmmaranan) and all original
contributors for creating this excellent extension.

## This tree (local / daily-driver work)

| Fact | Value |
| --- | --- |
| Remote | [jcrussell/forge](https://github.com/jcrussell/forge) |
| Local path (this clone) | `~/dev/me/forge_jcrussell` |
| Upstream reference clone | `~/dev/me/forge_original` (**do not** start new work there) |
| Extension UUID | `forge@jmmaranan.com` (installs **replace** the live extension) |
| Target host | `black` — GNOME Shell **46**, **X11**, dual 4K, hybrid AMD+NVIDIA |
| Displays | shellrc **`gdisplays`** (connector identity lives there, not in this repo) |

### Fork decision (historical)

Phase A of the fork eval compared **jcrussell/forge** vs upstream **forge-ext/forge**
and locked this tree as the product base (not a greenfield rewrite, not
`forge_original`). See [agents/plans/forge-fork-eval.md](agents/plans/forge-fork-eval.md).

Daily pain that motivated the trial: multi-monitor after blank/reattach, tab/stack
lifecycle thrash, and resize/session reliability. gdisplays v1 (shellrc) reduced
connector-rename stress; Forge still must survive workarea thrash without
crashing Shell.

### Current plan focus

Execution plan: **[agents/plans/forge-daily-driver.md](agents/plans/forge-daily-driver.md)**  
Priorities: **[agents/PRIORITY.md](agents/PRIORITY.md)**

| Slice | Status |
| --- | --- |
| **T0** stack off by default + DnD force tabbed | **Done** |
| **T1** tab chrome reliability (no empty gap / N labels) | **Done** |
| **T2** opt-in layout debug overlay | **Next** |
| **T3** blank/wake + tab survival (+ H1 soft-rehome live verify) | After install / T2 |
| **T4+** sizing policy, keybind system, snapshot/session | Later in plan |

Related: [forge-harden-and-session](agents/plans/forge-harden-and-session.md)
(H1 soft-rehome **code** done; live verify still open),
[layout thrash analysis](agents/plans/forge-layout-thrash-analysis.md).

Agent guidelines are composed with shellrc **`agents`** → root
[AGENTS.md](AGENTS.md) (`agents build`). Session plans/tasks live under
`agents/plans/` and `agents/tasks/`.

### Install trial on `black` (safe path)

UUID matches EGO Forge, so a trial **replaces** the installed extension. Prefer
the helpers under [`scripts/forge/`](scripts/forge/README.md):

```bash
./scripts/forge/status.zsh
./scripts/forge/switch-to-jcrussell.zsh   # backup → make dev → apply
# log out / log in on X11, then:
./scripts/forge/status.zsh
```

Do **not** skip backup. Rollback helpers are documented in `scripts/forge/`.

## Features

- Works on GNOME 45+ (X11 and Wayland)
- Tree-based tiling with vertical and horizontal split containers similar to i3-wm and sway-wm
- Vim-like keybindings for navigation/swapping windows/moving windows in the containers
- Drag and drop tiling
- Support for floating windows, smart gaps and focus hint
- Customizable shortcuts in extension preferences
- Some support for multi-display
- Tiling support per workspace
- Update hint color scheme from preferences
- Stacked and tabbed tiling layouts, plus workspace monocle
- Swap current window with the last active window
- Auto Split or Quarter Tiling
- Show/hide tab decoration via keybinding
- Window resize using keyboard shortcuts

## Fork Improvements

This fork includes significant improvements over the upstream version:

### New Features

- **Keybindings cheatsheet overlay** - Quick reference for all shortcuts (`Super+Shift+/`)
- **Portable config sync** - Export/import settings and keybindings for backup or sharing
- **Arrow key navigation** - Arrow keys work alongside vim-style hjkl bindings
- **Floating window rules UI** - Manage floating window rules directly in preferences
- **Screen edge margins** - Configurable gaps for compatibility with panels/docks
- **Additional keybindings** - Config reload, evenly distribute windows, workspace monocle, and more
- **More customization** - Border radius, tab margins, default layout, adjustable gap limits
- **Monitor exclusion** - Option to exclude specific monitors from tiling

### Bug Fixes

- Window resize and focus navigation fixes
- App-specific fixes for Chrome, Brave, Steam, Blender, ddterm, and others
- Stacked/tabbed container behavior improvements
- Preview hints and border rendering fixes
- Cross-workspace window operations
- Preferences saving and theme handling
- Soft rehome after workarea thrash (H1 — live verify still open)
- Tab chrome fallback when `Shell.App` is null (no empty tab strip)

### Code Quality

- Comprehensive unit test suite (1,600+ tests) plus a Dockerized E2E suite
- Refactored architecture with focused, extracted managers (see [architecture docs](docs/dev/architecture.md))
- Riskier options stay behind clearly-marked experimental toggles

## Known Issues / Limitations

- Does not support dynamic workspaces
- Does not support vertical monitor setup
- Multi-monitor blank/wake tab survival still under live verification (T3)
- Stack mode is **off by default** in this tree (tab-first; optional later)

## Installation

### From extensions.gnome.org

_Listing pending review — this fork is not yet published on extensions.gnome.org._
Once it is, install it from the [GNOME Extensions](https://extensions.gnome.org)
website (with the browser integration) or the **Extensions** / **Extension Manager**
app by searching for "Forge".

### From a pre-built release

Download `forge@jmmaranan.com.zip` from the
[latest release](https://github.com/jcrussell/forge/releases/latest), then:

```bash
# (optional) verify the checksum and build provenance
sha256sum -c SHA256SUMS
gh attestation verify forge@jmmaranan.com.zip --repo jcrussell/forge

# install
gnome-extensions install --force forge@jmmaranan.com.zip

# then log out and back in (X11: Alt+F2, then r) so the shell picks it up

# ...and enable
gnome-extensions enable forge@jmmaranan.com
```

`enable` fails with "does not exist" until the shell has re-scanned — that's why the
log-out/restart step comes between install and enable, not after.

### Build from source

```bash
# Install dependencies (Node.js 20+ and gettext required)
npm install

# Development build: compile and install to ~/.local/share/gnome-shell/extensions/
make dev

# Production build: compile, install, enable extension, restart shell
make prod
```

After installation, log out and log back in (or restart GNOME Shell on X11 with `Alt+F2`, then `r`).

![image](https://user-images.githubusercontent.com/348125/146386593-8f53ea8b-2cf3-4d44-a613-bbcaf89f9d4a.png)

## Documentation

Full docs live in [`docs/`](docs/):

- **User guide** ([`docs/user/`](docs/user/)) — [layouts & tiling](docs/user/layouts.md),
  [keybindings](docs/user/keybindings.md), [theming](docs/user/theming.md),
  [window rules](docs/user/rules.md), [portable config](docs/user/config.md),
  [multi-monitor](docs/user/monitors.md), [troubleshooting](docs/user/troubleshooting.md).
- **Developer reference** ([`docs/dev/`](docs/dev/)) — architecture, rendering
  pipeline, Mutter compatibility.
- **Design notes** ([`docs/DESIGN.md`](docs/DESIGN.md)) — durable “why” decisions.
- Press the cheatsheet chord in-session (Safe default: **`Ctrl+Super+/`**; Vim kit:
  **`Super+Shift+/`**) for live keybinding reference.

## Forge Override Paths

- Window rules: `$HOME/.config/forge/config/windows.json` — see [window rules](docs/user/rules.md) and [portable config](docs/user/config.md)
- Stylesheet: `$HOME/.config/forge/stylesheet/forge/stylesheet.css` — see [theming](docs/user/theming.md)

## GNOME Defaults

GNOME Shell has built in support for workspace management and seems to work well - so Forge will not touch those.

User is encouraged to bind the following:
- Switching/moving windows to different workspaces
- Switching to numbered, previous or next workspace

## Local Development Setup

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for environment setup, build/test commands, and code style. Run `make help` for the full list of targets.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and code style, and the
[upstream discussion](https://github.com/orgs/forge-ext/discussions/501) about the
path to merging this fork back into the main project.

## Credits

Thank you to:

- **The original Forge developers** - [@jmmaranan](https://github.com/jmmaranan) and all [upstream contributors](https://github.com/forge-ext/forge) who created this extension
- Michael Stapelberg/contributors for i3
- System76/contributors for pop-shell
- ReworkCSS/contributors for css-parse/css-stringify
