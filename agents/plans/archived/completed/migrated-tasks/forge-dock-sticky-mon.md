# Task — Dock open sticks to clicked monitor + LFT(m)

**Status:** done  
**Priority:** P0 (daily multi-mon)  
**Branch:** `task/forge-dock-sticky-mon`  
**Created:** 2026-08-08  
**Updated:** 2026-08-08  
**Completed:** 2026-08-08

## Problem

Clicking an app on the **left** monitor dock opens the new window on the
**right** monitor (and vice-versa). Expected: open on the **same monitor as
the dock that was clicked**, attached after the last focused tile **on that
monitor** (LFT(m)), else that monitor’s root.

## Acceptance

1. **Dock mon M click → home M** (sticky): new window homes to M even when
   global focus / global LFT is on the other monitor.
2. **Attach LFT(m)** when mon M has a tiled LFT; else mon root (not other mon’s LFT).
3. **Meta stickiness:** `move_to_monitor(M)` + short sticky grace.
4. **Detection hardened:** `activate` / `open_new_window` / `activate_full`;
   pointer geometry mon; app-id matching with/without `.desktop`.
5. **Focus override must not beat dock.**
6. **Unit tests** for dual-mon, pointer mon, activate_full, focus-steal guard.
7. Local commit on wrap-up; no push.

## Session note (final)

**A/B AGREE (2026-08-08).**

Root cause: weak dock detection + wrong mon source — hook missed
`activate_full`; mon from `get_current_monitor()` (focus-like) not pointer;
when dock missed, open-under-focus rehomed to focus mon.

Shipped:
- `monitorIndexFromPoint` (`lib/extension/lft-mru.js`)
- `WindowManager._resolveDockLaunchMonitor()` — pointer → mon, else current
- Dock hook wraps `activate`, `open_new_window`, `activate_full`
- Focus override never rehomes `plan.isDock`
- Tests: dual-mon focus0+dock1, pointer mon, activate_full, focus-steal guard
- Docs: DESIGN OP1 + DECISIONS D007

Tests: lft-mru + open-app-policy (59); broader unit window/extension green (B: 574).

**Residual:** live dual-mon smoke on `black` after install + Shell reload (HUP)
so `activate_full` wrap is installed if an older hook was already present.
