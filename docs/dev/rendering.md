# Rendering & placement pipeline

How a tree mutation becomes on-screen geometry. Entry point: `renderTree()` in
`window.js`. See [architecture.md](architecture.md) for the surrounding subsystems.

## `requestLayout` / `requestVerify` — `layout-controller.js` (CL0–CL6)

Preferred entry for sensor storms: `wm.requestLayout(reason)` trailing-debounces
(~200ms) then calls `renderTree` once with coalesced reasons. After a **successful**
idle body, `renderTree` schedules `requestVerify("post-render")`. `requestVerify`
has its own ~150ms debounce channel, then runs the Meta↔slot scanner
(`layout-verify.js`): each managed TILE leaf compares `get_frame_rect()` to
`renderRect`/`rect` within ε (default **4px**) and Meta mon vs tree MONITOR home.

| Verify outcome | Effect |
| --- | --- |
| Full agreement | `agreementCount++`; at **≥2** consecutive → **SETTLED**; after first ok auto-schedules `requestVerify("agreement-confirm")` |
| Mismatch | agreement = 0; unsettle; `requestLayout("verify-mismatch")` **once** per wave (latch until next full agreement) |
| `markUnsettled(reason)` | agreement = 0; not settled |
| **External geometry** (CL2) | `onExternalGeometry` → unsettle + requestLayout + requestVerify |
| **Periodic verify** (CL6, debug) | GSettings `layout-verify-interval-ms` (default **0** = off) → repeating `requestVerify("periodic")` |

Production stays **event-driven** only. The interval key is for diagnosing stuck
desync; leave it at 0 for daily use. Cancelled on extension disable / set to 0.

See [architecture.md](architecture.md#layout-control-loop-cl0cl1).

### Geometry sensor attribution (CL2 / W-storm)

`updateMetaPositionSize` (size/position-changed) attributes before retile:

| Case | Behavior |
| --- | --- |
| `_suppressGeometrySignalRetile` (Forge `move` / `tree.apply`) | Chrome only; **no** markUnsettled / layout |
| TILE frame ≈ slot (ε) | Chrome only; skip full layout |
| External drift (not grab, not maximize-reject) | `onExternalGeometry` → unsettled + debounced layout/verify |

Forge apply must not double-fire a layout storm: suppress is set for the duration
of `move()` and `tree.apply`. Pure helpers live in `layout-sensors.js`.

`renderTree` idle coalesce remains the inner commit layer; `requestLayout` sits
above it. Call sites may still invoke `renderTree` directly (commands, force
paths). Open-app path (CL4): quiet settle via `layout-open.js` then
`requestLayout("window-create")` (or one forced `renderTree` if render is frozen).

Multi-open / layout CLI (CL5): `LayoutBatch` holds open commits mid-batch;
fingerprint wait is batch quiet; residual `RunSteps` does freeze → one
`renderTree("run-steps")` → verify. No per-role mid-batch render flood.

## `renderTree(from, force)` — `window.js`

Renders are **debounced** through a single `GLib.idle_add` source so the bursts of
GNOME signals that follow one user action collapse into one layout pass.

- If render is frozen (mid-grab) or `tiling-mode-enabled` is off, it only refreshes
  decorations/borders and returns.
- Otherwise it schedules the idle body **once** (guarded by `_renderTreeSrcId`).

The idle body (`window.js`) runs this exact order — **the order is
load-bearing**:

```
tree.pruneDeadWindows()              // drop nodes whose Meta.Window wrapper is finalized —
                                     // one dead wrapper would throw out of every later step (forge-4b6)
processFloats()                      // classify every window TILE vs FLOAT
_reconcileFullscreenFloatDemotion()  // after processFloats, which re-pins floats (forge-zo4)
tree.render(from)                    // compute rects + move tiled windows
handleMaximizeOnSingle()             // maximize a lone tiled window per monitor
updateDecorationLayout()             // tab/stack decorations
updateBorderLayout()                 // focus/split borders
```

The source ID is reset in a `finally` (`window.js`): if a throw left it set,
every future `renderTree()` would no-op and new windows would stay floating
(Bug #531 / forge-cuv).

## `processFloats()` — `window.js`

Runs **every render**, unconditionally re-deciding tile-vs-float for each window:

```
nodeWindow.float = isFloatingExempt(w) || !workspaceTiled(w) || !monitorTiled(w)
```

There is **no persisted-float guard**. Consequence: any `Meta.Window` property
change that should affect tiling (e.g. `notify::wm-class`, `notify::above`) must be
wired to a per-window signal in `trackWindow` that calls `renderTree()`, or the
float decision is never re-evaluated.

## `tree.render → processNode → apply` — `tree.js`

- **`Tree.render(from)`** (`tree.js`) walks the tree.
- **`processNode`** (`tree.js`) sets each node's `renderRect` from its share of
  the parent, applying gaps/margins. Sibling sizes are percentage-based
  (`computeSizes` / `resetSiblingPercent` in `tree.js`).
- **`apply`** (`tree.js`) moves **every `mode === TILE` window** to its computed
  `renderRect` via `extWm.move()`.

### `move()` — the universal placement chokepoint (`window.js`)

Every tiled window is positioned here. It early-returns on a missing/grabbed/
**fullscreen** window and otherwise always calls `Compat.unmaximize()` before
`move_resize_frame`.

### Fullscreen / maximize gotchas

A fullscreen window keeps `mode === TILE` (fullscreen doesn't change node mode), so:

- `apply()` must **filter `is_fullscreen`** out of its tiled children, or it
  re-slices the fullscreen window to a split rect.
- `handleMaximizeOnSingle()` (`window.js`) maximizes the sole tiled window per
  monitor — but must **skip a lone fullscreen window** (it reads as not-maximized).
- `updateDecorationLayout()` (`window.js`) hides decorations on monitors with a
  maximized/fullscreen window, and its filter must also exclude **minimized**
  windows.

Headless E2E can't discriminate these geometry bugs (Mutter clamps fullscreen/
maximize itself) — prove them with unit tests at the `move()`/`apply()` level.

## Tree reload vs. render

`tree.reload()` (`tree.js`) is the **only full tree wipe**: it clears children,
recreates `WORKSPACE`/`MONITOR` nodes, then re-tracks windows **flat** (default
`HSPLIT`/`VSPLIT`) — so **`STACKED`/`TABBED` layouts and nesting are lost across a
reload**. It is invoked only from `enable()` and the no-`mo{m}ws{n}`-node fallback
inside `trackWindow` (`reloadTree`, `window.js`).

Everything else **preserves** the tree by routing to `renderTree` (which never
clears containers): workareas-changed, workspace add/remove, active-workspace, and
monitors-changed all re-track or re-render without wiping. So a plain resume or
monitor change does **not** lose layout — only a window-created event that can't
find its monitor/workspace node does. Confirm the trigger from logs before
"fixing" lost-layout reports.

## Floating subsystem

Float is the node's `mode` (`FLOAT`), set by `processFloats` each render — a float
keeps its tree node, it is not detached.

- **`isFloatingExempt`** precedence: a per-window/class **tile** override wins first,
  then float-by-type, then float overrides. Toggled via `toggleFloatingMode`
  (`window.js`); `Super+c` = per-window, `Super+Shift+c` = class-wide. A
  per-window remove must never delete a class-wide override.
- **Always-on-top** is re-pinned (`make_above`) by `processFloats` on every render,
  so any code changing a float's above-state must run *after* `processFloats` in the
  same idle. To put a float beneath a fullscreen window you need `unmake_above()`
  **and** `lower()` (unpin alone doesn't restack); restore re-raises with
  `make_above()`. Guard Forge's own toggles with a suppress flag so `notify::above`
  isn't read as a user pin.

## CSS / theme engine

`ThemeManagerBase` (`lib/shared/theme.js`) parses the stylesheet with the bundled
CSS parser in `lib/css/` and exposes `getCssProperty`/`setCssProperty`.
`updateDecorationLayout()` / `updateBorderLayout()` apply style classes
(`.window-tiled-border`, `.window-tabbed-tab`, palette classes …) to the actors.
Users override appearance at
`~/.config/forge/stylesheet/forge/stylesheet.css`; `patchCss()` syncs bundled
defaults into the user profile, and a GSettings trigger reloads the stylesheet.
