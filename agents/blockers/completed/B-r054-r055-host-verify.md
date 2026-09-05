# B-r054-r055-host-verify — Host verify R054/R055 open-leaf

**Status:** done
**Difficulty:** hard
**Owner:** human
**Kind:** verify
**Plan:** forge-tab-open-leaf-visibility
**Unblocks:** G8n stub on
[forge-retire-gobject-topology.md](../../plans/forge-retire-gobject-topology.md);
closing R054/R055 acceptance on
[forge-tab-open-leaf-visibility.md](../../plans/archived/completed/forge-tab-open-leaf-visibility.md)
**Priority:** P0
**Created:** 2026-09-02
**Updated:** 2026-09-02
**Closed:** 2026-09-02 — operator: fix worked (DnD CENTER Group first try)

## Why this is human-only

Wayland host requires manual restart.

## What the human must do

1. Run `forge install --dev` and restart Wayland.
1. Run `forge layout dev` and verify:
   - [x] All proper apps opened
   - [x] TAB groups contain proper tabs/apps
   - [x] Proper app has focus
   - [x] Proper tabs are visible in TAB groups
   - [x] DnD for join tab group, hsplit, and vsplit all work
     — was: first Nautilus→Ghostty-below CENTER failed, second worked.
     **Fix landed** via Mark 2 **Group** (D101; enter tab from any dir,
     not Join promote-join / SurfaceOp). Re-check after re-login. **PASS.**
   - [x] DnD chroming looks right
   - [x] DnD to TAB group makes new entry visible and focused
