# Task — T0: Stack off by default + DND force tabbed

**Status:** Ready  
**Plan:** [forge-daily-driver.md](../plans/forge-daily-driver.md)  
**Analysis:** [forge-layout-thrash-analysis.md](../plans/forge-layout-thrash-analysis.md)  
**Priority:** P1  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-daily-driver/completed/`

## Problem

Stacking is non-critical for the user and causes accidental stack groups on
drag-drop (center drop **joins** an existing STACKED parent and ignores
`dnd-center-layout`). Stack mode should be off by default; when off, DnD and
commands must not create STACKED groups.

## Goals

1. Default `stacked-tiling-mode-enabled` = **false** (schema + any first-run paths).
2. When stack mode is disabled:
   - Center drop never applies/joins STACKED.
   - Prefer TABBED (or convert STACKED parent → TABBED on center drop, preserve children).
3. `LayoutStackedToggle` already no-ops when disabled — keep that.
4. Optional: one-shot convert existing STACKED → TABBED when setting flips off (preserve children).
5. **Side note for T5:** list all gschema defaults that use bare `<Super>` + letter (no Shift/Ctrl/Alt) in the task note.

## Code touch list

| Area | Symbols / files |
| --- | --- |
| Schema default | `schemas/org.gnome.shell.extensions.forge.gschema.xml` → `stacked-tiling-mode-enabled` |
| DnD | `lib/extension/window.js` → `_buildDropOperation`, `_executeDropOperation`, `moveWindowToPointer` |
| Prefs (if copy defaults) | `lib/prefs/settings.js` only if needed |
| Tests | `tests/unit/window/WindowManager-drag-drop*.test.js` |

## Acceptance

- [ ] Fresh settings: stacked mode off; tabbed mode still on
- [ ] Center drop with stack off → TABBED group (never STACKED), including onto former stacked parent
- [ ] Unit tests cover stack-off + center drop
- [ ] `npm test` passes for touched suites
- [ ] Task note lists bare Super+ schema defaults (audit for T5)
- [ ] Plan session note updated

## Out of scope

- Tab label empty-gap fix (T1)
- Keybind redesign (T5)
- Soft rehome (T3)

## Session note

(empty — next agent fills)
