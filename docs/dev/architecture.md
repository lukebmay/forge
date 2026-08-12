# Architecture

Forge organizes a workspace's windows as a **tree** (like i3/sway) and reconciles
that tree onto the screen. Three tiers:

1. **Tree data model** (`lib/extension/tree.js`) — the in-memory layout.
2. **Window manager** (`lib/extension/window.js`) — the event hub that reacts to
   GNOME signals, mutates the tree, and renders it.
3. **GNOME integration** — keybindings, quick-settings indicator, preferences,
   theming, and the Mutter-version shims.

See [rendering.md](rendering.md) for the render pipeline, [actions.md](actions.md)
for per-action stage formulas (focus / move / open / …), and [compat.md](compat.md)
for Mutter API drift.

## Entry point & lifecycle

`extension.js` is the `ForgeExtension` (a GNOME `Extension` subclass).

- **`enable()`** (`extension.js`): loads the two GSettings schemas (main +
  `…forge.keybindings`); saves and overrides conflicting GNOME settings
  (`SETTINGS_OVERRIDES`, `lib/shared/gnome-overrides.js` — e.g. Mutter `edge-tiling`,
  `auto-maximize`, native maximize/tile keybindings; each original is restored on
  disable); then constructs, in order: `ConfigManager` → `ConfigSync` → theme →
  `WindowManager` → `Keybindings` → `Cheatsheet`; finally `extWm.enable()`.
- **`disable()`** (`extension.js`): restores the saved GNOME settings, then
  tears down each subsystem and nulls every reference. Order mirrors construction.
- **Session modes** (`_onSessionModeChanged`, `extension.js`): on the lock
  screen Forge **keeps the tree in memory** but disables keybindings and removes
  the indicator; it re-enables them on return to the `user` session. The tree is
  never serialized — locking must not lose the layout.

## The tiling tree

Defined in `tree.js`. Node types (`NODE_TYPES`, `tree.js`):

```
ROOT ─ WORKSPACE ─ MONITOR ─┬─ WINDOW
                            └─ CON ─┬─ WINDOW
                                    └─ CON ─ …      (containers nest)
```

- **`Node`** (`tree.js`) — one monitor, workspace, container (`CON`), or window.
  Child membership/order: `appendChild` / `insertBefore` / `removeChild` /
  `replaceChildren` only (D023). Do not assign `childNodes` or `parentNode`
  outside Node.
- **`Tree`** (`tree.js`) `extends Node`; its constructor calls
  `super(NODE_TYPES.ROOT, …)` (`tree.js`), so **the `Tree` instance *is* the
  root node** — there is no `tree.root` property. Walk from `tree` itself.
- **Layouts** (`LAYOUT_TYPES`, `tree.js`): `HSPLIT`, `VSPLIT`, `STACKED`,
  `TABBED`, `PRESET` (+ `ROOT`). A container's layout decides how its children are
  arranged.
- **Window modes** (`WINDOW_MODES` in `tree.js`): `TILE`, `FLOAT`, `GRAB_TILE`
  (being dragged), `DEFAULT`. Float state is the node's `mode`, **not** tree
  membership — a floating window keeps its node.

## Subsystems

| Module | Responsibility |
| --- | --- |
| `window.js` `WindowManager` | Event hub: binds GNOME signals, tracks windows, owns `renderTree`/`move`, focus, grab/drag. |
| `layout-controller.js` `LayoutController` | Debounced `requestLayout` / `requestVerify`; Meta↔slot verify is a **sensor** (ok → SETTLED; mismatch never reasserts); `onExternalGeometry` diagnostic only; CL6 optional debug periodic verify. |
| `layout-verify.js` | Pure frame↔slot ε compare, forest scan, TILE leaf collect. |
| `layout-sensors.js` | Pure attribution: stack suppress **or** active command echo epoch vs TILE in-slot chrome-only (CL2/AC2). |
| `layout-epoch.js` | Per-window command echo epochs + wave id (apply-contract AC2 residual). |
| `layout-placeholder.js` | AC4 thrash/fail-open isolate: pure plan + tree stub placeholder leaf; float client, reserve slot, remove → one reflow. |
| `layout-apply-chrome.js` | CL10 layout-apply dim scrim (~80%) + per-mon spinner/label (title ≈7.5% height) + hard ≤30s clear; clears after residual place (CLI finally). |
| `command.js` `CommandHandler` | Turns a user action into tree mutations (extracted from window.js). |
| `focus.js` `FocusManager` | Focus tracking + active-window signal lifecycle (extracted from window.js). |
| `decoration.js` `DecorationManager` | Stacked/tabbed container decorations and their actor lifecycle (extracted from window.js). |
| `keybindings.js` `Keybindings` | Registers shell keybindings → `CommandHandler`; drag modifier mask. |
| `workspace.js` `WorkspaceManager` | Workspace nodes + per-workspace signal lifecycle + renumbering. |
| `monitor.js` `MonitorManager` | Monitor-per-workspace nodes; split orientation per monitor geometry. |
| `cheatsheet.js` `Cheatsheet` | In-shell keybinding overlay (`Super+Shift+/`). |
| `indicator.js` | Quick-settings panel toggle. |
| `lib/shared/settings.js` `ConfigManager` | GSettings + JSON config (`windows.json` overrides). |
| `lib/shared/config-sync.js` `ConfigSync` | Mirrors GSettings ⇄ `settings.json`/`keybindings.json`. |
| `lib/shared/theme.js` + `lib/css/` | Stylesheet parsing/customization (see rendering.md). |

User-facing strings are localized with gettext; the catalog (`po/`) and Weblate
workflow are documented in [translations.md](translations.md).

## Layout control loop (CL0–CL2 + apply-contract)

Single writer intent for layout commits and post-render **sensor** checks.
Direction plan: `agents/plans/forge-layout-apply-contract.md` (supersedes
pixel-war settle in `forge-layout-control-loop.md`).

| Term | Means | Touches Meta? |
| --- | --- | --- |
| **Mutate tree** | In-memory topology / percent / mode | No |
| **Compute slots** | Walk tree → `renderRect` from workarea | No |
| **Commit / apply** | `move_resize_frame` each TILE leaf to slot | Yes |
| **Render** (`renderTree`) | prune → floats → compute + apply + chrome | Yes (apply) |
| **Request layout** | `requestLayout(reason)` → debounce → `renderTree` | Not yet |
| **Verify** | Read Meta frames; compare to slots (ε + mon); **sensor only** | Read |
| **Rebuild** (`reloadTree`) | Wipe mon/ws nodes, re-track flat | Yes |
| **Monitor-recovery** | Workareas thrash rehome (formerly soft-rehome, H1) | Yes |

API: `wm.requestLayout` / `wm.requestVerify` → `LayoutController`
(`lib/extension/layout-controller.js`). Layout debounce default 200ms; verify
150ms. Successful `renderTree` body schedules `requestVerify("post-render")`.
Verify scan (`layout-verify.js`): TILE leaves only; ε default 4px. **Single ok
→ SETTLED** (no agreement×2, no `agreement-confirm`, no thrash-extra). Mismatch
sets `settled=false` and stores `lastVerifyResult` — it does **not**
`reassertTilesByIds` or `requestLayout("verify-mismatch")`. SETTLED means we
are not re-fighting pixels, not permanent frame==slot equality.

**CL6 debug periodic verify:** GSettings `layout-verify-interval-ms` (uint, default
**0** = off). When > 0, arms a repeating timer that calls
`requestVerify("periodic")`. Restarted on setting change; cancelled on disable /
set to 0. Not for production daily use. Periodic fire must stay sensor-only.

**External geometry:** size/position sensors call
`layoutController.onExternalGeometry(reason)` → thrash-catalog observe +
`markUnsettled` + diagnostic `requestVerify` only (**no** `requestLayout`).
Forge apply sets `_suppressGeometrySignalRetile` around `move` / `tree.apply`
(in-stack re-entrancy) **and** starts a per-window **command echo epoch**
(`layout-epoch.js`, residual `COMMAND_ECHO_RESIDUAL_MS` = 350ms) after a real
`move_resize_frame` so post-stack client snap is still chrome-only. Attribution:
`isForgeCausedGeometrySignal(wm, metaWindow)` = stack suppress **or** active
echo for that window. LayoutBatch `begin` calls `layoutEpoch.beginWave()`.
TILE already within ε of its slot is chrome-only (W-storm in-slot). Helpers:
`layout-sensors.js`, `layout-epoch.js`. Open path (CL4): `layout-open.js` quiet +
catalog minQuiet → `_scheduleOpenCommit` → `requestLayout("window-create")`
(force `renderTree` only when render is frozen). External geom during pending
open resets quiet and does not early-`requestLayout`.

**AC4 thrash / fail-open isolate:** one bad client never reasserts the forest.
`wm.isolateThrashWindow(meta|node)` floats the mapped TILE client, inserts a
first-class **placeholder** TILE leaf (`placeholder` flag / `forge-placeholder`
wm_class; tree stub MVP) in the reserved slot, and issues **one**
`requestLayout("thrash-isolate")`. Placeholders are never thrash-isolated again
and are skipped by `tree.apply` Meta move and verify scan. Close path:
`wm.removePlaceholder(node)` → `removeNode` + `requestLayout("placeholder-remove")`
once. Helpers: `layout-placeholder.js`; GetTree exports `placeholder: true`.

**CL5 multi-open / layout CLI:** DBus `LayoutBatch(begin|end)` →
`wm.beginOpenLayoutBatch` / `endOpenLayoutBatch`. While depth > 0, open commits
and `requestLayout` only latch need-commit (no per-app mid-batch render).
`forge layout` wraps launches: begin → open all → map-pin wait → residual
`RunSteps` (freeze → ops → one `renderTree` + post-render verify) → end (one
deferred `requestLayout` only if no residual render already cleared the latch).
Optional debug LF6 whole-tree fingerprint quiet:
`--wait-tree-stable` / `FORGE_LAYOUT_WAIT_TREE_STABLE=1` (not the default gate).

**CL10 layout-apply chrome (default on):** GSettings `layout-apply-chrome-enabled`
(default **true**). During `beginOpenLayoutBatch` (depth ≥ 1) shows a
non-reactive full-stage ~80% black dim with a large white spinner +
“Forge: Loading layout…” centered on each monitor (`layout-apply-chrome.js`;
title ≈ **7.5%** of that monitor’s **stage** height as **visual** size —
CSS px = stage×ratio / `scale_factor` so St does not double-scale HiDPI —
detail half that). Cleared after residual bind/place/structure (CLI
`LayoutBatch chrome-clear` in finally after residual/belt; also on error).
Batch end alone does not clear — cold residual is the long visual phase.
Also `disable()` and a hard timer ≤ **30s**. Disable: Preferences → Settings →
Debugging, or
`gsettings set org.gnome.shell.extensions.forge layout-apply-chrome-enabled false`.

## Command dispatch flow

```
key chord ─▶ Main.wm.addKeybinding (keybindings.js) ─▶ callback
          ─▶ CommandHandler.execute(action) (command.js, switch on action.name)
          ─▶ WindowManager / Tree mutation ─▶ wm.renderTree(...)
```

`Keybindings.enable()` (`keybindings.js`) registers every entry of `this._bindings`;
each callback dispatches an `action` object into the `execute` switch. Drag-to-tile
is gated by the modifier mask in `allowDragDropTile()` (`keybindings.js`).

## GObject lifecycle discipline

Every subsystem **tracks its signal IDs and disconnects them on teardown** —
GNOME Shell reloads extensions in-process, so a leaked signal survives and
crashes later.

- `WindowManager._bindSignals()` / `_removeSignals()` (`window.js`)
  connect/disconnect display, workspace-manager, and per-window signals; the
  defensive disconnect ignores throws on already-finalized GObjects (Bug #328).
- Managers own their own signals: `WorkspaceManager._workspaceSignals` is a
  `Map<wsIndex, signalIds>` unbound in `removeWorkspace`/`destroy`
  (`workspace.js`).
- **Idle/timeout source IDs are reset in a `finally`** so a single throw can't
  wedge them. If `_renderTreeSrcId` stuck non-zero, every later `renderTree()`
  would no-op and new windows would stay floating (Bug #531 / forge-cuv; see
  rendering.md). The `window-added` debounce uses the same pattern
  (`workspace.js`).

## Configuration sources

Two layers, reconciled by `ConfigManager` + `ConfigSync`:

- **GSettings** — schema `org.gnome.shell.extensions.forge` (+ `.keybindings`).
  The runtime source of truth.
- **JSON files** under `~/.config/forge/config/`:
  - `windows.json` — per-window / per-class float & tile overrides
    (`ConfigManager`, `lib/shared/settings.js`).
  - `settings.json` / `keybindings.json` — portable mirror of GSettings, written
    and re-imported by `ConfigSync` (`config-sync.js`; see its `SETTINGS_KEYS` and
    `KEYBINDING_KEYS` maps) so a config can be version-controlled or moved between
    machines.

`ConfigSync.init()` runs during `enable()` and imports any present files.
