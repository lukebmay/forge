# Neovim

Location: `configs/nvim/` — NvChad v2.5 + lazy.nvim. Rich GUI-like UX; some structure/startup debt.

## Philosophy

Feel like a normal editor (tabs, tree, familiar keys) while keeping Neovim power (LSP, treesitter, macros).

| Pattern | Implementation |
| --- | --- |
| File tabs | NvChad tabufline (overridden) |
| Explorer | nvim-tree (right, `\`) |
| Ctrl+C/V/X/Z habits | Many Vim/NvChad maps remapped or no-op’d |
| Mouse / arrows / wrap | On |
| Find/replace | Telescope + grug-far |
| Minimap | neominimap |
| AI | avante (`VeryLazy`) |

**Do not change mappings or user-visible behavior without explicit authorization.**

## Main window

Primary editing pane = listed file buffers. Satellites (tree, minimap, terminal, help/qf floats) are **not** main windows.

Helpers: `util/nvim-utils` (`get_main_window`, `focus_main_window`), `overrides/tabufline` (tabs/help → main). Features that open files should focus the main window first.

## Layout

```
configs/nvim/
├── init.lua
├── lazy-lock.json
└── lua/
    ├── chadrc.lua, options.lua, mappings.lua
    ├── mappings/ plugins/ configs/ configs/lspconfigs/
    ├── overrides/ autocmds/ usercmds/ snippets/ util/
```

| Put… | Where |
| --- | --- |
| Global options | `options.lua` / `chadrc.lua` |
| Non-plugin maps | `mappings/` |
| Plugin opts/maps | that file under `plugins/` |
| Shared focus/commands | `util/`, `usercmds/`, `overrides/` |

## Dependencies (short)

- **Always-ish:** lazy, NvChad (base46, tabufline, telescope defaults), treesitter, lspconfig, cmp stack, conform, which-key, grug-far, neominimap, …
- **Lazy:** mason UI, mason-tool-installer (`VeryLazy`), noice, avante, nvim-tree (`cmd` + empty VimEnter), lazygit, trouble, …
- **Disabled:** `*.lua_` under plugins/autocmds/configs

## Startup

Order (sketch): timing → path utils (no hot-path npm) → globalize helpers → leader → lazy (NvChad + plugins) → base46 → options/autocmds/usercmds → `finish_init` → schedule tabufline + mappings → UIEnter log.

Measure: `$nvim_log` / `~/.local/state/nvim/simplog.log`; `NVIM_DEBUG=1 nvim` for phases.

| Milestone | Headless init |
| --- | ---: |
| Baseline | ~400 ms |
| A1 path | ~56–58 ms |
| A2 parrot gone | ~45 ms |
| A3 mason-tool-installer VeryLazy | **~40–44 ms** |

**Plan paused** (major wins done). Follow-ups: `agents/tasks/nvim-startup_followups.md`, plan `agents/plans/nvim-startup.md`.

## Key modules

| Module | Role |
| --- | --- |
| `util/keymap-utils` | `map` / `unmap` / modes |
| `util/nvim-utils` | Main window, `require_dir` |
| `util/path-utils` | PATH / NODE_PATH |
| `overrides/tabufline` | Buffer tabs → main window |
| `overrides/mappings` | Drop conflicting NvChad maps |

## Friction

- Eager plugins left are optional polish unless interactive still feels slow
- Side-effectful fake plugins (`auto-reload`, `case-nvim`, tree top-level)
- NvChad foundation vs eventual removal
- Dead `.lua_` files; uneven Lua quality

**Mappings/behavior stay stable unless authorized.**
