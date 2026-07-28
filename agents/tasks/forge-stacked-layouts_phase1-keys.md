# Task: Phase 1 layout keys + portable keybind profiles

**Plan:** forge-stacked-layouts  
**Status:** in progress (P1a done → P1b)

## Acceptance

1. `FORGE_KEYBIND_PROFILES_DIR` env overrides keybinding kit save/load dir (ConfigManager + docs).
2. shellrc `forge.zsh` exports it to `$shellrc/configs/forge/keybinding-profiles` (like `FORGE_LAYOUT_DIR`); ensure dir; XDG path usable (symlink migrate if needed).
3. Backup live keybinds into that shellrc dir before switching kits.
4. Apply full **Vim** kit to live gsettings (including Phase 1 chords).
5. Phase 1 code: stack mode default on; `LayoutStackTabToggle` tab↔stack only; merge; Safe g/s + Vim n/m; RunSteps `layout-cycle` / `merge-group` / `float`.
6. Unit tests green; docs/help updated.
7. Commits after each taskforce slice (user requested).

## Slices

| ID | Work | Commit |
| --- | --- | --- |
| P1a | Env var + shellrc + backup + apply Vim | yes — this session |
| P1b | Phase 1 verify / fix gaps (A/B) | yes |
| P1c | Docs/help wrapup + tests + final commit | yes |

## Session note (P1a)

- **ConfigManager** `keybindingProfilesDir` honors `FORGE_KEYBIND_PROFILES_DIR` (trim empty).
- **CLI** `forge keybind backup|apply|list|dir` via `scripts/forge/keybind_kit.py` (gsettings; auto `glib-compile-schemas` on source for Phase 1 keys).
- **shellrc** `forge.zsh`: export + mkdir + safe XDG → shellrc symlink/migrate.
- **Backup:** `$shellrc/configs/forge/keybinding-profiles/backup-before-vim-20260728.json`
- **Live:** Vim kit applied (incl. `con-stack-tab-layout-toggle` / `window-merge-group`).
- **Follow-up P1b:** extension handlers for new keys still uncommitted (command/tree/session-api); install/HUP so GNOME loads new schema keys from extension path; verify stack-tab toggle + merge live.
