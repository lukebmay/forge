# Task: intra-tab thrash (cross-mon focus + tab switch)

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-control-loop](../forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-06  
**Host:** black — Wayland dual 4K @ 1.5; Shell 46

## Problem (operator)

After `focus-no-reflow` (`097807d` — drop `renderTree("focus")`):

1. **Tab switch** — some flicker but seemed mostly OK.
2. **Click left-monitor Ghostty** → **right-monitor tab group thrash** (sizing /
   render glitch). Cross-mon focus still unsettles the other head’s TABBED group.

Smoke still requires: *No page reflow on every tab/focus; windows stay at slot size*.

## Likely causes (pre-investigation leads)

Do not assume only one; fix the real root(s).

| Lead | Path | Why it matches |
| --- | --- | --- |
| **A** | `focus-update` → `updateDecorationLayout()` | Hides **all** CON decorations, then re-shows every mon’s tab strips + `_restackDecorationAboveGroup` + `child.render()` — **both monitors** on every focus |
| **B** | `updateTabbedFocus` → `_reassertTabStackSiblingSlots` | On tab focus, `move()` every TILE sibling if Meta frame drifts; Chrome PWAs often report wrong frames → repeated `move_resize_frame` |
| **C** | forge-caused size/position | `updateMetaPositionSize` still calls `updateDecorationLayout` even when signal is forge-caused → hide/show chrome storm |
| **D** | other | size sensors / verify retry / full processNode paths still re-asserting inactive mon tabs |

Related landed work:

- `097807d` focus-no-reflow (no full `renderTree("focus")`)
- `1e3bd05` tile borders from slot; move epsilon 4px
- focus-update chrome path in `window.js` ~3122–3173
- `lib/extension/focus.js` tab/stack restack + reassert
- `lib/extension/decoration.js` `updateDecorationLayout` ~408–469

## Acceptance

1. **Cross-mon focus:** focusing mon0 Ghostty (or any non-tab window) must **not**
   reflow / hide-flash / resize the mon1 TABBED group (or vice versa).
2. **Tab switch within a group:** raise + chrome active state only; **no**
   unnecessary `move_resize_frame` on siblings that are already at tree slot
   (ε-aware). Prefer no full-tree decoration hide/show for simple focus moves.
3. **Borders / tab strip:** still track focus; tab strip remains clickable above
   window actors on the inactive monitor too (do not regress bury-under-actor).
4. **Unit tests** covering the regression(s) fixed (spy `move` / decoration
   hide-show / reassert scope). Prefer mutation-style tests like focus-no-reflow.
5. `npm test` / relevant vitest suites green.
6. No full `renderTree("focus")` reintroduced for ordinary focus.

## Out of scope

- MR rename; container selection; full decoration model rewrite
- Lock/sleep thrash (separate)
- Redesign of tab chrome styling

## Implement notes

| Do | Do not |
| --- | --- |
| Scope decoration updates to dirty groups / active mon when safe | Global hide-all then show-all on every focus if avoidable |
| Reassert slots only for the focused tab group when needed | Reassert every mon’s tabs on any focus |
| Keep raise + lastTabFocus for the focused TABBED/STACKED parent | Call `requestLayout("focus")` / force full apply |
| Preserve clickable strip on unfocused mon (restack when truly needed) | Leave strip unclickable under actors |

## Session note

**2026-08-06 Task Force A:** Cross-mon thrash fix (leads A+C primary).

### Root causes
1. **A** — `updateDecorationLayout()` hide-all + re-show/restack **every mon** on
   every `focus-update` (and forge geom). Click mon0 Ghostty → mon1 TABBED strip
   hide/show + `child.render()`.
2. **C** — forge-caused `size-changed`/`position-changed` always called full
   decoration layout after each `move()` (tab reassert / apply).
3. **B** — `_reassertTabStackSiblingSlots` only runs for the focused tab parent
   (not other mons); ε skip already present. Left as-is.

### Shipped
- `decoration.js`: `updateDecorationLayout({ scope: "focus"|"full", focusNode })`
  — focus = restack **only** focused TABBED/STACKED CON (no global hide);
  full = prior hide-all path. Helpers: `_restackFocusedTabDecoration`,
  `_showAndRestackTabDecoration`, `_monitorHasCoveringMaxOrFullscreen`.
- `window.js` focus-update → `{ scope: "focus", focusNode }`.
- `tree.js` `_activateFromTab` same focus-scope.
- `updateMetaPositionSize`: forge-caused + open-pending = **borders only**;
  non-grab external = borders only unless covering max/fs (then full deco);
  grab still full deco. Layout drift still requestLayout; renderTree owns strip.
- No `renderTree("focus")` reintroduced.

### Tests
- `WindowManager-focus.test.js`: focus-scoped deco arg; cross-mon no hide mon1;
  tab switch restack focused CON only + on-slot no move; forge/in-slot no deco.
- `DecorationManager.test.js`: scope:focus restack / no-op for non-tab.
- Ran: unit/window + unit/extension + regression — **1457 passed**.

### Operator smoke (after install)
Click mon0 Ghostty with mon1 Chrome tab group open — mon1 strip must not flash.
Tab switch within group: raise + active chrome; no ¼-height reflow.

### Acceptance
1–6 met in unit proof; live Wayland re-verify on black still recommended.

**2026-08-06 Task Force B:** **AGREE** — code review + re-run unit/window +
unit/extension + regression (1457 passed). No blocking findings. Residual: live
Wayland smoke after install/logout.
