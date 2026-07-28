# Task: Phase 1 layout keys + portable keybind profiles

**Plan:** forge-stacked-layouts  
**Status:** in progress (P1a + P1b done → P1c)

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
| P1a | Env var + shellrc + backup + apply Vim | yes — done |
| P1b | Phase 1 verify / fix gaps (A/B) | yes — this session |
| P1c | Docs/help wrapup + install/HUP verify + final | pending |

## Session note (P1b)

- **Handlers:** `LayoutStackTabToggle` (TABBED↔STACKED only), `WindowMergeGroup` (last-active / sibling → tabbed via `tree.mergeWindowsIntoGroup`).
- **Keybinds** registered; stack mode default **true**; tabbed remains default group (DnD / bare sugar / merge).
- **Gap fixed:** RunSteps validation — `layout-cycle`, `merge-group`, `float` (+ `order` on Python side) added to `EXTENSION_OPS` / `validateStep` (`run-steps.js`, `layout_lib.py`). Handlers alone were unreachable via DBus/CLI validation.
- **session-api:** Meta import; float uses `DEFAULT_FLOAT_LAYOUT` fields; ops wired in `_runStepHandlers`.
- **Tests:** command / tree / keybindings / run-steps / session-api layout-cycle+merge / layout_lib — green.
- **Follow-up P1c:** install/HUP so Shell loads schema keys; live verify stack-tab toggle + merge; docs polish if any leftover.

## Session note (P1a)

- **ConfigManager** `keybindingProfilesDir` honors `FORGE_KEYBIND_PROFILES_DIR` (trim empty).
- **CLI** `forge keybind backup|apply|list|dir` via `scripts/forge/keybind_kit.py` (gsettings; auto `glib-compile-schemas` on source for Phase 1 keys).
- **shellrc** `forge.zsh`: export + mkdir + safe XDG → shellrc symlink/migrate.
- **Backup:** `$shellrc/configs/forge/keybinding-profiles/backup-before-vim-20260728.json`
- **Live:** Vim kit applied (incl. `con-stack-tab-layout-toggle` / `window-merge-group`).
