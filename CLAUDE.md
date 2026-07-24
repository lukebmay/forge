# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Forge is a GNOME Shell extension providing i3/sway-style tiling window management. It supports GNOME 45+ on both X11 and Wayland, featuring tree-based tiling with horizontal/vertical split containers, stacked/tabbed layouts, vim-like keybindings, drag-and-drop tiling, and multi-monitor support.

## Build & Development Commands

Run `make help` for the full target list; `npm install` first (needs Node.js 20+ and gettext).

- **`make dev`** installs a debug build locally; **`make prod`** does a full install + enable + shell restart.
- **`make test`** (nested Wayland, no restart) / **`make test-x`** (X11) for manual in-shell testing.
- **`npm test`** runs the unit suite (mocked GNOME APIs); **`make unit-test-docker`** and **`make e2e-test`** are the canonical Docker environments.
- **`npm run format`** / **`npm run lint`** — Prettier, enforced by the husky pre-commit hook.

## Architecture

Forge models each workspace's windows as an i3/sway-style **tree** and reconciles it onto the screen. Entry points: `extension.js` (lifecycle) and `prefs.js` (GTK4/Adwaita preferences).

The tiling logic lives in `lib/extension/` (tree model, window manager, command dispatch, focus/decoration, keybindings, monitors/workspaces); shared config/sync/theme code is in `lib/shared/`. The Prefs UI (`lib/prefs/`) is GTK4/Adwaita and not unit-tested.

See **[docs/dev/](docs/dev/)** for the detailed reference: [architecture.md](docs/dev/architecture.md) (lifecycle, tree model, command dispatch, signal/cleanup discipline, config sources), [rendering.md](docs/dev/rendering.md) (render/placement pipeline, reload triggers, floating subsystem, theme engine), [compat.md](docs/dev/compat.md) (Mutter API drift + shim recipe).

## Testing Infrastructure

- **Unit tests** — Vitest with mocked GNOME APIs (`tests/mocks/`); run `npm test`, or `make unit-test-docker` for the canonical Docker environment. Structure, mock helpers, and how to write non-vacuous tests: **[tests/README.md](tests/README.md)**.
- **E2E tests** — real GNOME Shell in self-contained Fedora Docker containers (D-Bus `Shell.Eval` + xdotool); run `make e2e-test` (default GNOME 49), `make e2e-test GNOME_VERSION=<n>`, or `make e2e-test-all`. Supported versions in `tests/e2e/gnome-versions.json`. Full infrastructure docs: **[tests/e2e/README.md](tests/e2e/README.md)**.

## Key Concepts

- **Tiling tree**: Windows are organized in a tree structure similar to i3/sway. Containers can split horizontally or vertically, or display children in stacked/tabbed mode.

- **Window modes**: TILE (managed by tree), FLOAT (unmanaged), GRAB_TILE (being dragged), DEFAULT

- **Session modes**: Extension disables keybindings on lock screen but keeps tree in memory to preserve layout

- **GObject Classes**: All core classes extend GObject with `static { GObject.registerClass(this); }` pattern.

- **Signal Connections**: Track signal IDs for proper cleanup in disable().

## Configuration Files

- GSettings schema: `org.gnome.shell.extensions.forge`
- Window overrides: `~/.config/forge/config/windows.json`
- Stylesheet overrides: `~/.config/forge/stylesheet/forge/stylesheet.css`

## Code Style

- Prettier with 2-space indentation, 100-char line width
- Husky pre-commit hooks enforce formatting
- Use `npm run format` before committing

## Branches

- `main` - GNOME 45+ (current development)
- `legacy`/`gnome-3-36` - GNOME 3.36 support (feature-frozen)


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

When ending a work session (no auto-commit / auto-push — see `agents/project.md`):

1. **File issues for remaining work** — create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) — tests, linters, builds
3. **Update issue status** — close finished work, update in-progress items
4. **Hand off** — short context for the next session (what shipped, what’s next)

**Git (this project):** do **not** `git commit` or `git push` unless the user
**directly** asked in the current message. “Commit” means commit only — never
push unless they also asked to push. Session end alone is not authorization.
<!-- END BEADS INTEGRATION -->
