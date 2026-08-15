# forge-first-class-containers_c0-kill-monocle — C0 inventory + delete monocle

**Status:** done  
**Plan:** [forge-first-class-containers](../../forge-first-class-containers.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.5` as 4.5 **medium**.

## Goal

Monocle is a structure-destroying flatten. Delete it (REG-monocle,
REG-i3-super-m). Inventory other **lossy** layout transitions so C1
`setLayout` has a call-site list. Do not implement `setLayout` here.

## Acceptance

- [x] `toggleWorkspaceMonocle` / `workspace-monocle-toggle` gone
      (command, keybind, schema, docs)
- [x] i3 kit `<Super>m` **unbound** (REG-i3-super-m); Safe/Vim
      already unbound
- [x] REG table in the FCC plan updated (Drop when = C0 done)
- [x] Monocle-only tests deleted or rewritten (no empty stubs)
- [x] Written inventory in this task session note: every call site
      that changes CON `layout` and whether it reparents/flattens
      (needed by C1)
- [x] No new `setLayout` yet
- [x] Kits + user keybindings docs mention Super+m is free (Wave Z
      already uses Enter for zoom — do not rebind m to zoom)
- [x] README / layouts user docs no longer advertise monocle

## Session note

**2026-08-15 C0 shipped on master.**

### Deleted

| Surface | Path |
| --- | --- |
| `toggleWorkspaceMonocle` | `lib/extension/window.js` |
| `WorkspaceMonocleToggle` | `lib/extension/command.js` |
| keybind map | `lib/extension/keybindings.js` |
| schema key | `schemas/…gschema.xml` + recompiled |
| JSON schema prop | `config/keybindings.schema.json` |
| kit bindings | `lib/shared/keybind-presets.js` (i3 had `<Super>m`) |
| KEYBINDING_KEYS | `lib/shared/settings-keys.js` |
| pot string | `po/forge.pot` |
| unit tests | CommandHandler monocle block; keybind expected key |
| regression | `tests/regression/bug-wf49-monocle-heuristic.test.js` |
| e2e | `tests/e2e/tests/test_workspace_monocle.py` |
| fuzz action | `WorkspaceMonocleToggle` removed from `actions.py` |
| docs | layouts monocle section; README; keybindings kit tables |

### Super+m

Unbound on all kits. Docs note free for later; **zoom stays on Enter**
(Wave Z). Do not rebind m→zoom in residual Z0 unless plan revises.

### Guards run

```bash
npm test -- tests/unit/keybindings/ \
  tests/unit/shared/keybind-presets.test.js \
  tests/unit/command/CommandHandler.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js
```

### C1 lossy-layout inventory (CON `layout` mutators)

Legend: **in-place** = layout field only (children keep identity);
**reparent** = moves nodes; **flatten** = peels nested CONs to window
leaves; **wrap** = invents CON then may set layout; **scaffold** =
new node / restore / mon root only.

#### User / command (high priority for C1 `setLayout`)

| Site | File | Lossy? | Notes |
| --- | --- | --- | --- |
| `LayoutToggle` | `command.js` | **in-place** H↔V | No reparent; ok template for I1 split cycle |
| `LayoutStackedToggle` | `command.js` | **in-place** + optional **wrap** | On MONITOR: `tree.split` then set STACKED/split; exit resets percents |
| `LayoutTabbedToggle` | `command.js` | **in-place** + optional **wrap** | Same pattern as stacked |
| `LayoutStackTabToggle` | `command.js` | **in-place** | STACKED↔TABBED only; no-op on H/V |
| `session-api._layoutOp` | `session-api.js` | **LOSSY** | Tab/stack: may `tree.split` (wrap) then **`_flattenLayoutParentToWindows`** peels nested CONs. Absolute mode for profiles/CLI |
| `session-api._layoutCycleOp` | `session-api.js` | **in-place** | group or split axis only; no flatten (safe for I1 cycle) |
| `session-api._mergeGroupOp` → `mergeWindowsIntoGroup` | `tree.js` | **reparent / wrap** | Explicit group create — C2 territory, not silent setLayout |
| ~~`toggleWorkspaceMonocle`~~ | ~~window.js~~ | **removed** | Was full-workspace reparent + TABBED flatten |

#### Mode / setting toggles

| Site | File | Lossy? | Notes |
| --- | --- | --- | --- |
| `_handleLayoutModeToggle` | `window.js` | **in-place bulk** | Disabling tabbed→split all TABBED; stacked→TABBED then restore via `prevLayout` |
| `applyDefaultLayoutToContainer` | `window.js` | **in-place** | New CON after split only |
| `Node.resetLayoutSingleChild` | `tree.js` | **in-place** | STACKED/TABBED→HSPLIT when ≤1 child (after move/dnd) |
| `auto-exit-tabbed` path in `removeNode` | `tree.js` | **in-place** | TABBED→split when one child left (REG-auto-exit-tabbed) |
| `_reorientOnClose` | `tree.js` | **in-place** | H/V only, opt-in setting |
| Empty MONITOR layout reset | `tree.js` `removeNode` | **scaffold** | Geometry default when mon empties |

#### Open / insert / structure

| Site | File | Lossy? | Notes |
| --- | --- | --- | --- |
| `tree.split` | `tree.js` | **wrap** or **in-place** | 1-child H/V toggles axis in-place; else wraps in new CON |
| `slotSplitUnit` / `slotSplitForInsert` | `tree.js` / `window.js` | **wrap** | D032 insert wrapper; sets H/V on new CON |
| leftoverSlot join | `window.js` track/rehome | **in-place** on 1-child H/V | Sets layout from orientation before append |
| tiny-pane tab fallback | `window.js` `_maybeAspectSplitForOpen` | **wrap** + TABBED | forceSplit then `tabCon.layout = TABBED` |
| peel-to-pair after ungroupish move | `tree.js` (~1887) | **in-place** | Parent of two after peel gets split from rect |
| `cleanTree` single-child CON collapse | `tree.js` | **reparent + inherit layout** | Grandkids up; parent.layout = child.layout |

#### DnD

| Site | File | Lossy? | Notes |
| --- | --- | --- | --- |
| createCon path | `drag-drop.js` | **wrap** + set H/V/group | New CON or reuse 1-child CON |
| simple insert | `drag-drop.js` | **in-place** on parent | Can flip containerNode to H/V/TABBED |
| center merge | `drag-drop.js` | **reparent** | `mergeWindowsIntoGroup` |
| stack-mode-off force TABBED | `drag-drop.js` | **in-place** | After center join |

#### Profile / snapshot / mon recovery (expected reshape)

| Site | File | Lossy? | Notes |
| --- | --- | --- | --- |
| `tree-snapshot` apply | `tree-snapshot.js` | **scaffold** | Restores descriptor.layout on mon/CON |
| skeleton mon split | `session-api.js` | **scaffold** | monNode.layout H/V for cold layout PH |
| `_newLayoutCon` | `session-api.js` | **scaffold** | Creates CON with layout |
| mon-loss collect CON | `monitor-recovery.js` | **scaffold** | New CON.layout from survivor mon |
| `_ensureLiveMonitorNodes` | `monitor-recovery.js` | **scaffold** | New mon layout from geometry |
| `monitor.js` / `workspace.js` create | | **scaffold** | New mon/ws default HSPLIT or rect |

### C1 guidance (do not implement here)

1. Route user toggles (`Layout*Toggle`, cycles, eventually `_layoutOp`)
   through non-destructive `setLayout(con, L)` — **no flatten, no
   reparent of leaves**.
2. Keep explicit **flatten** only for profile repair / CLI ensure
   flags (document; REG-ensure-flatten).
3. First conversion targets: `LayoutTabbedToggle` /
   `LayoutStackedToggle` exit/enter, then `_layoutOp` lose the
   `_flattenLayoutParentToWindows` call for pure mode change.

### Do not (confirmed)

- No `setLayout` API yet
- No Super+m → zoom rebind
- No TD1 tab-strip edits
