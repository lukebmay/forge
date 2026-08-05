# Task: forge-layout-control-loop_cl7-live-ghostty

**Status:** ready  
**Owner:** human / operator (live on black)  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop` (install from this branch after merge or checkout)  
**Created:** 2026-08-05

## Goal

Operator smoke on **black**: sole Ghostty open frame ≈ slot; border matches; multi-open /
`forge layout dev` no mid-batch thrash; note X11 or Wayland session.

## Acceptance (operator)

1. Install debug build from control-loop branch (`./install` / `make dev`).
2. Enable logging if useful:
   ```sh
   gsettings set org.gnome.shell.extensions.forge logging-enabled true
   gsettings set org.gnome.shell.extensions.forge log-level 4
   ```
3. Sole Ghostty on mon0: window frame fills correct tile; border not full-ring/small-client desync.
4. Second Ghostty / thrashy resize still settles.
5. `forge layout dev` (or usual multi-open profile): no render-per-open flood; layout stable.
6. Record session (X11 vs Wayland) and any residual in plan/HANDOFF.

## Agent note

Agents do **not** claim this done without operator confirmation. Unit path CL0–CL6 is green.

## Session note

(ready — operator)
