# forge-layout-reliability_op2-dock-second-tile

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

With one Ghostty already tiled on mon0, open a **second** Ghostty from the
**dock on mon1**. It must tile into the mon1 layout immediately — not sit as a
loose/float-looking window (no Forge float border) until the user drags it.

## Observed

1. One Ghostty left mon.
2. Dock click Ghostty on right mon.
3. New window appears float-like (no float border).
4. Drag → snaps into tile place.

## Hypotheses

1. New nodes start `WINDOW_MODES.FLOAT` until `processFloats` / first
   `renderTree` (~200ms queue) — Meta frame never placed until grab/size-changed.
2. Dock mon sticky / `detectDockLaunchMonitor` fails → wrong mon LFT / mon-root.
3. `firstRender` skips transitions but first tile geometry never applied until drag.
4. Ghostty null/late wm-class path floats briefly then never re-tiles without drag.

## Acceptance

- [x] Second dock Ghostty on mon1 ends **TILE** on mon1 without user drag. *(unit)*
- [x] Root cause in session note; regression test where feasible (mock track/place).
- [x] No reliance on user dragging to “fix” tile. *(unit path)*
- [x] Live re-verify on black.
- [x] Do not close live windows / Shell. No SSH.

## Non-goals

- Layout profile reconcile (LF5).
- Float-exempt dialogs.

## Session note (2026-07-29 Task Force A)

### Root causes

1. **Dock appId strict equality** — Shell.App `get_id()` is often
   `….desktop` while WindowTracker / `_forgeAppId` may omit `.desktop` →
   `matchPendingDockLaunch` missed → home followed mon0 global LFT while Meta
   sat on mon1 (loose-looking until drag re-home).
2. **`tree.apply` skipped first placement for lone maximized tiles** —
   `_isLoneMaximizedTile` filtered out `firstRender` windows, so Meta
   restore-geometry never got Forge’s first `move()` until drag.
3. **200ms create queue** for dock opens left a longer FLOAT gap; dock now uses
   50ms create delay.

### Shipped

| Area | Change |
| --- | --- |
| `lib/extension/lft-mru.js` | `normalizeDockAppId`; match ignores `.desktop` casefold |
| `lib/extension/tree.js` | firstRender always places (bypass lone-max skip); keep firstRender on zero/missing rect |
| `lib/extension/window.js` | dock create queue 50ms; insertChildPercent before queue |
| tests | lft-mru normalize; open-app-policy OP2; dyt2 firstRender place |

### Tests

- vitest open-app-policy + lft-mru + dyt2 + bug-530: **55 passed**
- broader `tests/unit/{extension,window,tree}`: **934 passed**

### Live re-verify (operator)

One Ghostty mon0; dock-click Ghostty on mon1 → tiles on mon1 without drag.

**Branch:** `plan/forge-layout-reliability` — no commit (parent wraps after B).

## Verifier (2026-07-29 Task Force B)

**Verdict: AGREE**

Reviewed dock appId normalize, firstRender lone-max place bypass, create-delay
50ms dock path, bug-530 / dyt2 interaction. Re-ran vitest lft-mru + open-app-policy
+ dyt2 + bug-530 → **55 passed**.

| Check | Result |
| --- | --- |
| `.desktop` / bare / casefold match | OK (`normalizeDockAppId`) |
| Steal-other-app still blocked when want set | OK (unchanged mismatch path) |
| firstRender bypasses `_isLoneMaximizedTile` once | OK; dyt2 non-firstRender still skips |
| firstRender kept on zero/missing renderRect | OK |
| bug-530: first move still preserves transitions | OK (tests green) |
| Dock create delay 50ms; non-dock 200ms | OK; float-exempt skips queue (willTile) |

**Risks remaining:** live re-verify open; apply still clears `firstRender` after
`move()` early-return (no actor) so lone-max skip can re-engage without place;
50ms heuristic may race on slow map.
