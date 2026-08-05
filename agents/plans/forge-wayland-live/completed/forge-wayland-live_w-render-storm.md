# forge-wayland-live — W-render-storm: eliminate known render storms

**Status:** done  
**Plan:** [forge-wayland-live.md](../plans/forge-wayland-live.md)  
**Branch:** `plan/forge-wayland-live`  
**Created:** 2026-08-05  
**Priority:** P0 stability (before W4 thrash smoke / session-backend)

## Problem

Operator on Wayland: Nautilus network share → session death; GNOME sets
`disable-user-extensions=true`. Journal showed **hundreds of**
`render tree from title-changed` while browsing; Ghostty prompt titles alone
drove dozens of full tree renders per minute.

Broader pattern: the tree re-renders on **noisy Meta signals** that do not
change layout policy. Idle-coalesce (`_renderTreeSrcId`) only merges one
burst; each completed apply can re-emit `size-changed` / `position-changed` →
another scheduled render → thrash / reflow / crash risk.

This is **not** a speed optimization. Stability first: stop self-induced
layout storms.

## Root causes (known)

| Source | Why it storms | Proper fix (not a band-aid) |
| --- | --- | --- |
| `notify::title` → `renderTree` | Path/prompt titles fire continuously; W1 late-title mirrored wm-class blindly | Re-tile **only** when title change can flip float/tile policy (empty↔non-empty or title-scoped override). Optional chrome refresh without full apply. |
| `notify::wm-class` → `renderTree` | Same class of identity signal; can re-fire | Re-tile only when class **settles** (null/empty → real) or class string actually changes policy |
| `size-changed` / `position-changed` → `updateMetaPositionSize` → **always** `renderTree` for non-max focused | `tree.apply` → `move_resize_frame` → signals → render → apply loop | Suppress re-entry while Forge is applying geometry; outside apply, **do not** full re-layout TILE windows already at tree slot (epsilon). Still handle grab resize, external maximize (#461), real external drift. |
| `window-entered-monitor` → always `updateMetaWorkspaceMonitor` → `renderTree` | Mid-apply mon noise partially suppressed; still re-renders when already home | No-op when tree mon/ws already matches Meta (no rehome needed) |
| Every `renderTree` → `_queueSessionLayoutSave` | Amplifies disk/journal under thrash | Keep debounce; only queue when topology/geometry **actually** changed (if cheap) — optional stretch if core paths fixed |

## Non-goals

- Session backend split (W6)
- Border cosmetics beyond not thrashing apply
- Micro-optimizing `tree.render` internals for speed
- “Debounce harder” as the only fix without cutting the feedback loop

## Acceptance

1. **Title / class identity**
   - Late empty→real title still re-tiles (W1 regression tests green).
   - Nautilus path spam / shell prompt title changes do **not** call `renderTree`.
   - Late null→real wm-class still re-tiles once; same-class re-notify does not storm.

2. **Apply feedback loop**
   - Geometry applied by Forge (`move` / `tree.apply`) does **not** schedule another full `renderTree` via size/position-changed.
   - External maximize/edge-snap rejection (#461) still works.
   - Keyboard/grab resize still updates percents.
   - Focus still does **not** full `renderTree` (chrome only) — keep that invariant.

3. **Entered-monitor**
   - No rehome + no full render when window already under correct mon/ws node.

4. **Tests**
   - Update/add unit + regression tests for: title spam, apply suppress, size-changed no re-render when in slot, entered-monitor no-op when home.
   - Existing suites that assert edge-snap / late-title / focus chrome still pass.
   - `npm test` green for touched areas (at least related unit/regression files).

5. **No residue**
   - No debug-only storm counters left in production paths unless behind existing Logger.debug.
   - Prefer clear suppress/guard names over ad-hoc flags scattered without docs in DECISIONS/HANDOFF.

6. **Docs**
   - Overwrite plan session note + this task note; brief HANDOFF line on storm sources fixed.

## Out of scope for this task if timeboxed

- Soft-rehome thrash W4 live smoke (operator)
- Merging to master (operator border + storm confirm first)

## Session note

**Shipped (Task Force A):** root-cause render-storm guards — not debounce-only.

| Guard | Where | Behavior |
| --- | --- | --- |
| Title identity | `_titleChangeNeedsRetile` + seed in `_bindWindowSignals` | Retile only empty↔non-empty or title-override match flip; path/prompt spam no-op |
| wm-class identity | `_wmClassChangeNeedsRetile` + seed | Late null→real still retile once; same-class re-notify no-op |
| Apply feedback | `_suppressGeometrySignalRetile` in `tree.apply` + `move()` | size/position-changed mid-commit does not `renderTree` |
| In-slot TILE | `_tiledWindowAtTreeSlot` in `updateMetaPositionSize` | Frame ≈ renderRect/rect (ε=4) → chrome only |
| Entered-monitor | `updateMetaWorkspaceMonitor` | `renderTree` only when rehomed (or dock sticky / missing mon node) |

**Files:** `lib/extension/window.js`, `lib/extension/tree.js`; tests:
`tests/regression/bug-w-render-storm.test.js` (new), `bug-w1-late-title-retile`, `bug-482-late-wmclass`.

**Verify:** `npm test -- tests/regression/bug-w-render-storm.test.js tests/regression/bug-w1-late-title-retile.test.js tests/regression/bug-482-late-wmclass.test.js tests/regression/bug-461-edge-snap.test.js` — all green. Live: logout to load ES modules; Nautilus path browse + Ghostty title spam must not thrash journal with `render tree from title-changed`.

**Residual:** deferred Mutter size-changed after suppress clears still hit in-slot gate; optional `_queueSessionLayoutSave` topology-only not done.

**Verify (B):** **AGREE** — re-ran storm/W1/#482/#461 + `tests/unit/window/` (485) green. Nested suppress + #461/grab/focus chrome-only preserved.
