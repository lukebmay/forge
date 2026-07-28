# Task: STACKED defaults + stack↔tab + merge-group keybinds

**Plan:** [forge-stacked-layouts.md](../plans/forge-stacked-layouts.md)  
**Status:** done (code + unit tests; live install optional)

## Acceptance

1. [x] `stacked-tiling-mode-enabled` default **true** (gschema + portable settings schema).
2. [x] Tabbed remains default **group** type: `dnd-center-layout=tabbed`, bare-array sugar tabbed, stacks via object form.
3. [x] Keybind **stack ↔ tab** on focused container (`con-stack-tab-layout-toggle` / `LayoutStackTabToggle`).
4. [x] Keybind **merge** focused + last-active (fallback: tiled sibling) into **tabbed** group (`window-merge-group` / `WindowMergeGroup`).
5. [x] Kits (Safe/Vim/i3) + docs + unit tests updated.
6. [x] Targeted vitest green (201 tests).

## Session note

**2026-07-28 (phase 1 lock + P1b)**

- Stack mode default **on**; tabbed stays default group type.
- **Phase 1 safe:** `LayoutStackTabToggle` = TABBED↔STACKED only (no-op on H/V).
- Kits: Safe `Ctrl+Super+g` group / `Ctrl+Super+s` split; Vim `Shift+Super+n` group /
  `Ctrl+Super+n` split / `Shift+Super+m` merge.
- CLI RunSteps: `layout-cycle`, `merge-group`, `float` (registered in `EXTENSION_OPS` +
  Python `layout_lib` so validation accepts them).
- Later: shallow groupify, groups-of-groups, enter/exit move mods, float park stamp.
