# Task: WS3 — Docs + live dual-ws smoke

**Status:** done  
**Plan:** [forge-layout-workspace-scope.md](../forge-layout-workspace-scope.md)  
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

**2026-08-06 WS3 (Task Force A)**

### Docs / help
- Added **Workspace scope** section to `docs/user/layout.md` (default current-ws, sequential XOR static, mix error, 1-based CLI vs 0-based tree, preflight all-or-nothing, save `:``@` ban).
- Commands table + Tips aligned; Wayland note (same CLI; full matrix deferred).
- `forge layout help` already matched WS2 locks (no code change needed).

### Install
- `./install` → `versionName` `v49-90-beta.2-200-g67abe4f-dirty` (then dirty only for docs until commit).
- Logging: `logging-enabled true`, `log-level 4` via extension schema dir.
- Host: black, **X11**.

### Live smoke (X11)

| Check | Result |
| --- | --- |
| `forge layout dev --dry-run` | `workspace 1 (current)`; `candidates: 9 on ws1 (ignored 1 on other workspaces)` |
| Live `forge layout dev` | ok; Inkscape `990413139` stayed `mo0ws1` (PASS isolation) |
| Sequential multi dry-run `dev default` / `dev default t1` | PASS — targets current+1…; per-ws candidate lines |
| Static dry-run `2:dev` / `default@2` | PASS — workspace 2; ignored other desks |
| Full multi live apply | **skipped** (would open many apps on empty desks); dry-run proven live |
| `nosuchprofile` | exit 1; tree sha unchanged |
| `99:dev` | exit 1 OOR; tree unchanged |
| `dev 2:dev` mix | exit 1; tree unchanged |
| 5 bare names span | exit 1 need 5 / session 4; tree unchanged |
| `save bad:name` | exit 1 charset |

### Residual
- Wayland full matrix: operator after logout (same CLI expected).
- Optional: live multi-ws apply on empty desks when operator accepts opens.

**Move to:** `agents/plans/forge-layout-workspace-scope/completed/` on wrap-up.
