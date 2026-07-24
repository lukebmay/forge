# Task — T5: Keybind system (safe defaults, presets, save/load)

**Status:** Done (A/B **AGREE**)  
**Plan:** [forge-daily-driver.md](../../forge-daily-driver.md)  
**Analysis:** [forge-layout-thrash-analysis.md](../../forge-layout-thrash-analysis.md) § Keybinds as first-class  
**Priority:** P2  
**Kind:** Plan-linked

## Problem

Forge defaults claim many bare `Super+letter` chords (hjkl focus, float `c`,
border `x`, split `g`, tiling `w`, lock `q`, …). Those are **user-space** for
launchers and desktop shortcuts. Power users want vim-style maps, but shipping
only that map forces everyone to rebind one key at a time. Portable
`keybindings.json` exists; **one-click presets** and **named profiles** do not.

## Product lock

1. Bare Super+ **letter/number** are user-space — defaults must not claim them.
2. Prefer `Shift+Super` / `Alt+Super` / `Ctrl+Super` (and further combos).
3. Presets (one click): `safe` (shipping default), `vim` (current-style hjkl).
4. Save / load custom named profiles under user config.
5. Schema migration: **fresh installs** get `safe`; **existing** GSettings values
   stay until the user applies a preset / Restore defaults / import.

## Goals

1. **`lib/shared/keybind-presets.js`** — pure data + apply helpers (unit-testable):
   - `PRESET_IDS`: `safe`, `vim`
   - Full binding maps for each (all `KEYBINDING_KEYS` + optional
     `mod-mask-mouse-tile`)
   - `getPreset(id)`, `listPresets()`, `applyBindings(kbdSettings, map)`
   - `isBareSuperLetterOrNumber(accel)` helper used by tests / validation
2. **Schema defaults = `safe`** in
   `schemas/org.gnome.shell.extensions.forge.gschema.xml` (recompile schemas).
3. **`vim` preset** = previous schema defaults (today’s map before this change).
4. **Prefs → Keyboard:**
   - Apply **Safe** / **Vim** preset (one click each)
   - **Save profile** (name → file) / **Load profile** (pick name)
   - Keep Disable All + Restore Defaults (`reset` → schema = safe)
5. **Named profiles** at
   `~/.config/forge/config/keybinding-profiles/<name>.json`
   (same shape as portable `keybindings.json`: version, mod-mask, bindings).
6. Docs: `docs/user/keybindings.md` + short DESIGN note.
7. Unit tests for presets, bare-Super invariant on safe, apply, profile I/O shape.

## Safe preset map (required)

| Key | Safe default |
| --- | --- |
| `window-focus-left` | `['<Super>Left']` |
| `window-focus-down` | `['<Super>Down']` |
| `window-focus-up` | `['<Super>Up']` |
| `window-focus-right` | `['<Super>Right']` |
| `window-toggle-float` | `['<Ctrl><Super>c']` |
| `prefs-tiling-toggle` | `['<Ctrl><Super>w']` |
| `prefs-lock-screen` | `['<Ctrl><Super>q']` |
| `focus-border-toggle` | `['<Shift><Super>x']` |
| `con-split-layout-toggle` | `['<Shift><Super>g']` |
| `con-split-horizontal` | `['<Shift><Super>z']` |
| `con-split-vertical` | `['<Shift><Super>v']` |
| `prefs-open` | `['<Ctrl><Super>period']` |
| `window-swap-last-active` | `['<Ctrl><Super>Return']` |
| `window-reset-sizes` | `['<Ctrl><Super>equal']` |
| `window-expand` | `['<Ctrl><Super>bracketright']` |
| `window-shrink` | `['<Ctrl><Super>bracketleft']` |

All other keys: keep current multi-mod defaults (swap Ctrl+Super hjkl, move
Shift+Super hjkl, tabs/stacks, snaps, resize edges, cheatsheet, reload, gap,
layout-debug `Ctrl+Super+d`, etc.). No new bare Super+letter/number.

**Vim preset:** prior defaults including Super+hjkl, Super+c, Super+x, Super+g,
Super+w, Super+q, Super+Period, Super+Return, Super+=, Super+brackets, etc.

## Code touch list

| Area | Notes |
| --- | --- |
| `lib/shared/keybind-presets.js` | **New** — presets + apply + bare-Super helper |
| `lib/shared/settings.js` | Profile path list/save/load helpers (or thin wrappers) |
| `lib/prefs/keyboard.js` | Preset + profile UI |
| `schemas/…gschema.xml` | Defaults → safe |
| `docs/user/keybindings.md` | Safe defaults table + presets/profiles |
| `docs/DESIGN.md` | Short keybind-system note |
| Tests | `tests/unit/shared/keybind-presets.test.js` (+ profile if needed) |

## Acceptance

- [x] Schema defaults match `safe`; no bare Super+letter/number in safe defaults
- [x] `vim` preset restores prior power-user map
- [x] Prefs can apply either preset without rebinding keys one-by-one
- [x] Named profile save + load round-trips bindings
- [x] Restore Defaults = schema = safe
- [x] Existing user GSettings not auto-migrated on upgrade (only new/reset)
- [x] Unit tests pass; `npm test` green
- [x] `make schemas` (or build) compiles gschema
- [x] Docs updated

## Out of scope

- i3-ish third preset (later)
- Rebinding GNOME system keys beyond existing gnome-overrides
- Cheatsheet redesign
- Full i3 IPC

## Session note

**Shipped (A/B AGREE + follow-up):**

- **Grammar:** primary `Ctrl+Super`; secondary `Ctrl+Shift+Super` for twins; **no
  bare Super+** in Safe (including arrows).
- **Kits:** `safe` (install only, not recommended), `vim`, `i3` (recommended).
- **Your kits:** save/load after tweak (`keybinding-profiles/`).
- **Conflicts:** `keybind-conflicts.js` + prefs banner; confirm on Super+/recommended kits.
- **Prefs copy:** Safe ≠ recommended; encourage trying kits.
- **Tests:** 28 kit/conflict tests; suite **1671** pass; `make schemas` OK.

**Next plan slice:** T6 full in-memory tree snapshot.
