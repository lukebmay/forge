# Task: focus-no-reflow (Wayland Chrome flicker)

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-control-loop](../forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-06  
**Host:** black — Wayland dual 4K @ 1.5; Shell 46

## Problem

Operator (Wayland): **every focus change** (click or keyboard) causes visible
flicker. Chrome PWAs (Grok, Gmail, Google Voice, …) briefly show at ~¼ height
then snap to full tile height. Almost all chrome web apps affected.

Smoke criteria already require: *No page reflow on every tab/focus; windows stay
at slot size* (`forge-wayland-live_residual-smoke.md`).

## Root cause (investigation)

`metaWindow.connect("focus", …)` in `lib/extension/window.js` always ends with:

```js
this.renderTree("focus", true);
```

That **force-schedules a full layout commit** (processNode → apply →
`move`/`move_resize_frame` on every TILE window). On Wayland, Chrome clients
reflow hard when re-asserted even near the same slot.

Chrome path already exists on the same signal:

- `queueEvent("focus-update")` → restack tab/stack, `updateDecorationLayout`,
  `updateBorderLayout`, `movePointerWith`
- Float raise path has its own `renderTree("raise-float-queue")`

TABBED/STACKED content rects are **not** focus-dependent (all leaves share the
content rect; focus only **raises**). So full re-apply on focus is unnecessary
for topology/geometry.

## Acceptance

1. **No full `renderTree("focus")` on ordinary focus** when tiling is settled
   and topology unchanged. Focus path updates border + tab chrome + raise only.
2. Unit coverage: focus signal / handler does **not** schedule full tree apply
   (spy `renderTree` or tree `apply` / `move`); still calls decoration/border
   (or equivalent chrome-only helpers).
3. Float-focus raise path still works (raise + optional render for float queue).
4. Deferred open still short-circuits (CL8) — no thrash.
5. `npm test` / `make unit-test` green for touched suite.
6. Live Wayland (operator or agent after install): focus walk mon0↔mon1 and
   tab switches — **no** ¼-height → full snap; pages do not reflow.

## Out of scope

- Redesign of tab active styles beyond ensuring they still update without full
  layout (lightweight sync OK).
- X11-only polish; MR rename; container selection.

## Implement notes

| Do | Do not |
| --- | --- |
| Drop unconditional `renderTree("focus", true)` | Leave force-render “just in case” |
| Keep restack / border / decoration / LFT / attachNode | Skip chrome so borders stick on old window |
| If tab-active class needs focus: small helper | Re-run processNode just for CSS class |
| Prefer chrome-only when frozen / settle | Call `requestLayout("focus")` as a soft reintro |

## Session note

**2026-08-06 A/B AGREE:** Dropped unconditional `renderTree("focus", true)` from Meta
`focus` in `lib/extension/window.js`. Chrome path unchanged (`focus-update` queue →
stacked/tabbed raise, decoration, border, pointer); float still
`raise-float` → `renderTree("raise-float-queue")`; CL8 deferred short-circuit
intact. Unit: 4 new cases (mutation-proven). B re-ran window unit suite 507
passed.
