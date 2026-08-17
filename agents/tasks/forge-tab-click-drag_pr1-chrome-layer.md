# forge-tab-click-drag_pr1-chrome-layer — Tab chrome layer

**Status:** ready
**Plan:** [forge-tab-click-drag](../plans/forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Agent:** `grok-4.5` **medium**. Implement the **locked** attach
algorithm. Escalate to `grok-4.6` only if that algorithm cannot
work (do not invent a restack latch or a second hit-plate).

## Goal

CON TABBED/STACKED decorations leave `global.window_group` and
live on `#forge-tab-chrome` so Meta `raise` / `focus` /
`activate` cannot bury tabs. Pickability is attach +
`trackChrome` + visibility, not another restack call site.

This is **PR1 only**. No wrap planner, no 2D insert, no pressed
CSS, no schema defaults.

## Acceptance

- [ ] `#forge-tab-chrome` host: `NO_LAYOUT`, `reactive: false`,
      not sized to the stage, **not** `addChrome`/`trackChrome`d
- [ ] Host parented in `Main.layoutManager.uiGroup` immediately
      **above** `window_group` and **below** `top_window_group`
      (never a bare `add_child` at end of `uiGroup`)
- [ ] `_createDecoration` does **not**
      `window_group.add_child`. It builds the `St.BoxLayout`
      and calls `decorationManager.attachTabDecoration(con)`
- [ ] `attachTabDecoration` is **idempotent**: reparent if
      needed; `trackChrome` only if a `DecorationManager`
      WeakSet does not already hold the deco. Second attach on
      a live deco does **not** throw (GNOME 46 `_trackActor`
      throws on re-track). Parent change does not untrack
- [ ] First track:
      `trackChrome(decoration, { affectsStruts: false,
      trackFullscreen: false, affectsInputRegion: true })`
- [ ] `untrackChrome` + WeakSet delete in `_destroyDecoration`
      and orphan sweep
- [ ] `layer.visible === window_group.visible` via
      `notify::visible` (Overview / lock / greeter). Overview
      hide is backup only, not the only path
- [ ] Apply overlay show: only
      `set_child_above_sibling(overlay, layer)`. **Never**
      `set_child_below_sibling(layer, overlay)`
- [ ] `_restackDecorationAboveGroup` is attach + optional
      layer sibling order. **Delete** `insert_child_above` vs
      window actors. Early-return on
      `window_group.contains(deco)` is gone
- [ ] Teardown walks the **layer**:
      `Utils._disableDecorations`, `_sweepOrphanDecorations`,
      `WindowManager.disable` (layer gone before tree drop),
      `Tree.reload`
- [ ] Split/window **borders** and tree `rootBin` stay in
      `window_group`. Only `type === "forge-deco"` CON strips
      move
- [ ] `revealGroupChild` sequence unchanged (R025/R026/R032)
- [ ] ApplyLayout Done restack stays **no-raise**
- [ ] Suites below green
- [ ] Nest (mon=1): after ApplyLayout / raise, repeated
      `_activateFromTab` switches LTF; deco parent is the
      layer; deco not in `window_group`
- [ ] Host: lock/overview — no tab titles visible. If the
      session is Wayland, say so; X11 stage input-region is
      unproven on Wayland (do not claim that gate)

## Context for the next agent (complete + succinct)

### Read first

1. [forge-tab-click-drag.md](../plans/forge-tab-click-drag.md)
   §1 **Attach algorithm (lock)** — implement that, not a
   paraphrase.
1. I-TabPickable clauses in the same section.
1. Do **not** re-litigate D039–D044 / D023–D026 / D032 / D025.

### Locked attach (do not reshape)

1. Host `St.Widget` name `forge-tab-chrome`.
   `Clutter.ActorFlags.NO_LAYOUT`, `reactive: false`,
   `clip_to_allocation: false`. 0×0 is fine; children paint
   outside. Never track the host.
1. `uiGroup.add_child(layer)` then immediately
   `set_child_above_sibling(layer, window_group)` **and**
   `set_child_below_sibling(layer, top_window_group)`.
1. `attachTabDecoration`: reparent to layer; track only if
   WeakSet miss; then add to WeakSet. Own the WeakSet on
   `DecorationManager`. Do **not** poke
   `layoutManager._trackedActors` / `_findActor`.
1. Visibility: one bind to `window_group.visible`.
1. Overlay: restack overlay **above** layer only.

Why `trackChrome` on each strip: GNOME 46 `_updateRegions`
builds the X11 stage input region from **tracked** chrome
only. Untracked `uiGroup` children can paint and miss clicks
on X11. Nest is Wayland and will not catch that.

Why not `addChrome` the host: `addChrome` tracks + stacks
below `top_window_group`, but a tracked full-stage host
steals every tile click. Host stays untracked 0×0.

### Files

| File | Change |
| --- | --- |
| `lib/extension/decoration.js` | Layer owner, attach, WeakSet,
  `notify::visible`, rewrite restack, layer orphan sweep.
  Import `Main` |
| `lib/extension/tree.js` | `_createDecoration` stop
  `window_group.add_child`; `_destroyDecoration` untrack |
| `lib/extension/utils.js` | `_disableDecorations` layer-aware
  (`untrackChrome`, destroy layer children + layer) |
| `lib/extension/window.js` | `disable()` still calls that
  helper first (layer dies before tree drop) |
| `lib/extension/layout-apply-chrome.js` | After
  `uiGroup.add_child(this._actor)`,
  `set_child_above_sibling(overlay, layer)` if layer exists |
| `lib/extension/session-api.js` | Comments only if needed;
  Done `_restackTabDecorations` stays no-raise (now
  attach/sync) |
| `tests/mocks/helpers/globalSetup.js` | Default
  `Main.layoutManager`: `uiGroup` (same child-list mock as
  `window_group`), `trackChrome` / `untrackChrome` (throw on
  re-track if already in a Set — matches Shell),
  `global.top_window_group`. `window_group` needs
  `connect("notify::visible")` / `visible` |
| Tests listed below | Rewrite `window_group` index
  assertions to: deco **not** in `window_group`; parent is
  layer; tracked; layer above `window_group` |

**Also rewrite** (they assume deco ∈ `window_group`):

- `tests/regression/bug-tab-click-activate.test.js`
- `tests/regression/bug-auto-exit-tabbed-ghost-decoration.test.js`
- `tests/regression/bug-s7qo-processTabbed-decoration-selfheal.test.js`
- `tests/regression/bug-tab-deco-workspace-orphan.test.js`
- `tests/regression/bug-ogmd-decoration-orphan-teardown.test.js`
- `tests/unit/extension/DecorationManager.test.js` (only deco
  cases — border stays in `window_group`)

Add a unit: `attachTabDecoration` twice → no throw; second
call does not call `trackChrome` again.

### Traps

- Cheatsheet / apply overlay already use `uiGroup`. Do not
  steal their Z. Park the layer; lift the **overlay**.
- `tests/setup.js` `global.Main` has no `layoutManager` today.
  `installGnomeGlobals` must supply one or every deco test
  dies.
- `_disableDecorations` today is `window_group` children with
  `type != null`. Only CON strips set `type = "forge-deco"`.
  After PR1 those are on the layer — if you forget this
  helper, disable/reload leak titles + hit plates.
- `_sweepOrphanDecorations` walks `window_group` today —
  orphans on the layer would live forever.
- Do not move split borders (`decoration.js` still
  `window_group.add_child(splitBorder)`) or window borders.
- Do not change `revealGroupChild` order or add a trailing
  `focus()`.
- Do not start PR2–PR6 (wrap keys, `planTabbedWrap`,
  `tabStripInsertIndex2D`, pressed CSS).
- Do not call `_layoutOp`. Do not parent a CON deco into
  `window_group` as fallback without a warn — better to
  fail loud.
- Comments: short *why* only (`comments.md`). No attach
  essays in source.

### Enable / test

```bash
npm test -- tests/regression/bug-tab-click-activate.test.js \
  tests/regression/bug-auto-exit-tabbed-ghost-decoration.test.js \
  tests/regression/bug-s7qo-processTabbed-decoration-selfheal.test.js \
  tests/regression/bug-tab-deco-workspace-orphan.test.js \
  tests/regression/bug-ogmd-decoration-orphan-teardown.test.js \
  tests/unit/extension/DecorationManager.test.js \
  tests/unit/extension/action-pipeline.test.js \
  tests/unit/extension/layout-apply-chrome.test.js

./install --kit=vim
forge nested run --monitors=1 -- bash -lc \
  'env FORGE_JOB=0 forge layout _forge-test-clean'
# Then Shell.Eval / session helper: _activateFromTab; assert
# deco.get_parent() is the layer. Stop nest when done.
```

Host (operator, if session is Wayland): lock screen must not
show tab titles. X11 `L1.r032` remains a later gate if this
host is Wayland.

### Escalate

Stop and ask if: `uiGroup` is not the parent of `window_group`
on this Shell; `trackChrome` without a tracked ancestor does
not `_trackActor`; or a half-moved world (some decos still in
`window_group`) is the only way units pass.

## Session note

**2026-08-17:** Task opened for handoff. Design consensus in
the plan (Q1 wrap-on in PR4; Q2 `max-tab-rows=0` unbounded).
No PR1 code yet.
