# Task: WS3 — Docs + live dual-ws smoke

**Status:** ready  
**Plan:** [forge-layout-workspace-scope.md](../plans/forge-layout-workspace-scope.md)  
**Branch:** `plan/forge-layout-workspace-scope`  
**Depends on:** WS0–WS2  
**Created:** 2026-08-06  

## Goal

User docs + live verification that multi-ws desks stay isolated.

## Acceptance

1. `docs/user/layout.md` + `forge layout help` match product locks.
2. Live X11 black: app on ws2 (e.g. Inkscape) unchanged by `forge layout dev` on ws1.
3. Live: `forge layout A B` sequential from current with enough workspaces.
4. Live: missing profile / OOR workspace / too few ws → no mutations (spot-check tree).
5. Wayland residual note: same CLI when operator on Wayland (full Wayland matrix can wait residual task).

## Session note

(ready — not started)
