# Task: forge-wayland-live_w2-place-wait

**Status:** ready for verify  
**Plan:** [forge-wayland-live.md](../plans/forge-wayland-live.md)  
**Branch:** `plan/forge-wayland-live`  
**Created:** 2026-08-04

## Problem (live + code map)

1. **Chrome PWA wait timeout:** layout forces `wmClass: Google-chrome`; Wayland
   maps PWA as `chrome-<id>-Default`. CLI `_class_eq` does not match; wait fails
   with that class in `seenClasses`. PlaceNext also class-strict → miss.
2. **Wrong monitor:** PlaceNext sets tree home mon but only dock path calls
   `safeMoveToMonitor`. Meta stays on restore/pointer mon →
   `window-entered-monitor` rehomes tree off the PlaceNext mon.
3. **Null class at map:** PlaceNext not re-tried when class lands later.

## Acceptance

1. **Class equality sugar (CLI + extension):** `Google-chrome` /
   `google-chrome` / `Chromium` family matches Chrome PWA ids
   (`chrome-*-Default`, `crx_*`) for wait and PlaceNext. Unit tests for both
   `_class_eq` (or Python helper) and `wmClassEqual` / place-hint.
2. **PlaceNext / mon home forces Meta monitor:** when open plan has a home
   monitor from PlaceNext (and optionally non-dock mon home from plan), call
   the same sticky move path as dock (`safeMoveToMonitor` + short grace) so
   Meta and tree stay on that mon. Do not break pure LFT pointer path for
   generic opens without a place hint.
3. **Deferred PlaceNext (minimal):** if window maps with null class and a
   pending hint exists, re-evaluate place when class lands (wm-class notify
   path or consume-on-match retry) so first chrome/PWA still gets mon/path.
4. **Tests green** for place-hint, open placement, and any new regressions.
   Prefer pure unit tests; no need to run full layout live in agent if hard.
5. **No X11 regression:** ordinary Google-chrome still matches itself; dock
   sticky unchanged.

## Out of scope

- Guake (W3), thrash lock (W4), CSS theme colors.

## Research notes (explore)

- CLI wait: `scripts/forge/forge` `wait_for_wm_class` / `_class_eq`
- PlaceNext: `lib/extension/place-hint.js`, `window.js` `_tryPlanFromPlaceHint`
- Dock sticky to mirror: `_applyDockStickyHome`
- Layout fields: `scripts/forge/layout_apply.py` `open_action_to_launch_fields`

## Session note

**2026-08-04 W2 B-rework (A):** (1) Chrome equality tightened — browser↔PWA and
browser↔browser only; distinct PWA/crx never match unless exact. Synced
`place-hint.js` `wmClassEqual`, `forge` `_class_eq`, `layout_plan.py` `_class_eq`.
Negative tests in place-hint, test_forge_class_eq, TestClassEqChromeFamily.
(2) `_retryPlaceHintAfterIdentity` reparents under `plan.attachLft` / path via
`_resolveAttachTarget` + `_reparentForLatePlace` (not mon-root only). Test:
deferred treePath attach. Vitest extension/window 810 + pytest class_eq suites green.
