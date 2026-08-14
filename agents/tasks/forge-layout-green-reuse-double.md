# forge-layout-green-reuse-double — R029/R030 map-pin / untracked admit

**Status:** in progress
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Green `forge layout dev` tiles on the first apply, reuses existing windows
on the second, and does not crash Chrome.

## Acceptance

- [x] Name the failed phase: **open / reuse** (map-pin title + parallel Chrome)
      plus **TILE** (empty title, no `notify::title`) plus **untracked maps**
- [x] Class-only leftover pin at map-wait timeout; class-only replan claim
- [x] Serialize chrome-family opens (same profile)
- [x] `notify::title` re-renders like late wm-class
- [x] Admit untracked Meta windows before plan + during map-wait (D035)
- [x] L0 guards for the inverted user contract
- [ ] Host/green live: `./install` then `layout dev` on an empty desk;
      second `layout dev` reuses (does not double)

## Context for the next agent (complete + succinct)

Green jobs `022733` / `022805` (after R029/`25fdf5c`): first apply
`opened 3`, map-wait timeout Grok+ghostty, `released: 3` deferred;
second apply opened Grok+ghostty again. X11 still had two Grok PWAs
(`WM_WINDOW_ROLE=pop-up`) and two Ghostty windows; GetTree only had
FLOAT New Tab + placeholders. focusWindowId `117563264` was not in the
tree.

Map-wait/plan only see tree windows. `trackWindow` returned without
attaching when dest `moNwsW` was missing (`reloadTree` idle). Untracked
maps stay invisible → pin timeout → next apply launches again.

D034 + D035. Guards: `test_wait_class_fallback_*`, `TestClaimClassFallback`,
`bug-r029-late-title`, `bug-r030-untracked-map-pin`. Trace:
`~/.config/forge/config/layout-apply-trace.log` + `session-layout-trace.log`
(`layout-track:`). Green is X11: `./install` + HUP.

## Session note

**2026-08-13 (2):** SSH green after R029 live fail. Implemented D035
admit + dest fallback + map-wait dump. L0 JS+pytest green. Next: push,
install+HUP on green, close leftover chrome/ghostty, empty-desk
`layout dev` twice.
