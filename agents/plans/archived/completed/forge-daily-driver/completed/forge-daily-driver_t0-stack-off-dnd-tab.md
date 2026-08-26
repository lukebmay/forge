# Task — T0: Stack off by default + DND force tabbed

**Status:** Done  
**Plan:** [forge-daily-driver.md](../../forge-daily-driver.md)  
**Analysis:** [forge-layout-thrash-analysis.md](../../forge-layout-thrash-analysis.md)  
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

- [x] Fresh settings: stacked mode off; tabbed mode still on
- [x] Center drop with stack off → TABBED group (never STACKED), including onto former stacked parent
- [x] Unit tests cover stack-off + center drop
- [x] `npm test` passes for touched suites
- [x] Task note lists bare Super+ schema defaults (audit for T5)
- [x] Plan session note updated

## Out of scope

- Tab label empty-gap fix (T1)
- Keybind redesign (T5)
- Soft rehome (T3)

## Session note

**Shipped (T0):**

1. **Schema** — `stacked-tiling-mode-enabled` default `false` (`schemas/org.gnome.shell.extensions.forge.gschema.xml`). Tabbed stays `true`. Prefs bind-only (no hardcoded default).
2. **DnD force tabbed when stack off** (`lib/extension/window.js`):
   - `_resolveDndCenterLayout()` — if `dnd-center-layout` is stacked and stack mode off → `TABBED`.
   - `moveWindowToPointer` uses resolved layout in `ctx.centerLayout`.
   - `_buildDropOperation` center join: stacked preview only when stack mode on and not forcing tabbed.
   - `_executeDropOperation`: join into STACKED with effective TABBED converts parent → TABBED; post-center guard never leaves STACKED when stack mode off.
   - `_getDragDropCenterPreviewStyle` uses resolved layout.
3. **One-shot convert** — `_handleLayoutModeToggle`: STACKED disable → **TABBED** (preserve children); re-enable restores TABBED nodes with `prevLayout === STACKED`. TABBED disable still → split.
4. **`LayoutStackedToggle`** — unchanged no-op when disabled (`command.js`).

**Key APIs/paths:** `_resolveDndCenterLayout`, `_handleLayoutModeToggle`, `_buildDropOperation`, `_executeDropOperation`, `moveWindowToPointer`.

**Tests:** drag-drop + comprehensive stack-off cases; forge-at72 updated for STACKED→TABBED. `npm test`: 169 files / 1613 passed.

**Bare Super+ audit (T5):** letter/number only (no Shift/Ctrl/Alt):

| Key | Default |
| --- | --- |
| `focus-border-toggle` | `<Super>x` |
| `con-split-layout-toggle` | `<Super>g` |
| `con-split-horizontal` | `<Super>z` |
| `con-split-vertical` | `<Super>v` |
| `window-focus-left` | `<Super>h` (+ `<Super>Left`) |
| `window-focus-down` | `<Super>j` (+ `<Super>Down`) |
| `window-focus-up` | `<Super>k` (+ `<Super>Up`) |
| `window-focus-right` | `<Super>l` (+ `<Super>Right`) |
| `window-toggle-float` | `<Super>c` |
| `prefs-tiling-toggle` | `<Super>w` |
| `prefs-lock-screen` | `<Super>q` |

Also bare Super (non letter/number): `Period`, `Return`, `equal`, `bracketleft`/`bracketright`, arrows. No bare Super+digit defaults.

**Residual risk:** Existing user installs keep prior gsetting until reset; unit fixture `DEFAULT_SETTINGS` still has stack `true` for path coverage (schema is product default). Re-enable STACKED restores via `prevLayout` on TABBED only — intentional one-shot convert groups.
