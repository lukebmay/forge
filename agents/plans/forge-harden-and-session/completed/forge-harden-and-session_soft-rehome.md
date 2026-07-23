# Task — Soft rehome on workareas thrash (blank / auto-lock / wake)

**Status:** Done (implementation + unit/regression; manual overnight on black still recommended)  
**Plan:** [forge-harden-and-session.md](../plans/forge-harden-and-session.md)  
**Priority:** P1 (P0 product for multi-mon daily driver)  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-harden-and-session/completed/`

## Problem

After **overnight GNOME auto-lock** (idle), wake can leave **all tiled windows clustered on one monitor**. Manual lock (`Super+Delete` / lock now) usually keeps placement.

Root pattern (known):

1. Idle lock + display power / GPU re-probe (hybrid AMD+NVIDIA, dual 4K)  
2. Mutter `workareas-changed` thrash (index/geometry flicker; windows reassigned to primary)  
3. Forge `renderTree` / tree keys use **monitor index** → piles onto one head  
4. Only hard guard today: ignore signal when `n_monitors == 0` (`_onWorkareasChanged`) — not enough when count stays ≥1 but wrong  

Related: Phase C of [forge-fork-eval](../plans/forge-fork-eval.md); design slice **H1** in harden plan.

## Goals

1. On stable `workareas-changed` (and/or monitors-changed), **soft-rehome** windows to the best monitor by last geometry / intersection area.  
2. Re-parent tree nodes **without full wipe** when structure is still consistent.  
3. Fall back to `reloadTree` + layout-group restore only when inconsistent.  
4. Unit/regression tests for thrash sequences; no Shell crash on retab after rehome.  
5. Doc note: blank/wake recovery; when to `gdisplays load`.

## Non-goals

- gdisplays connector remap (shellrc)  
- Stable EDID monitor IDs (later H2 unless still needed after soft rehome)  
- Session/`workon` layout apply (later slice)  
- Full rewrite of tree model  

## Entry points (code)

| Area | Path |
| --- | --- |
| Workareas signal | `lib/extension/window.js` → `_onWorkareasChanged` |
| Monitor enter | `window-entered-monitor` → `updateMetaWorkspaceMonitor` |
| Expensive rebuild | `reloadTree` / `trackCurrentWindows` / `tree.reload` |
| Layout preserve | `tree.snapshotLayoutGroups` / `restoreLayoutGroups` |
| Workarea safety | `lib/extension/utils.js` → `getWorkAreaSafe` |
| Monitor manager | `lib/extension/monitor.js` (if present) |

## Suggested approach

1. Snapshot per-window **last good** `{ monitorIndex, center, frame }` on quiet renders (or only on workareas enter).  
2. Debounce workareas-changed until `n_monitors` + geometries stable (short settle timer).  
3. Soft rehome: map each WINDOW node → target monitor by max intersection (fallback last center); move node under correct `mo{N}ws{W}` without destroying split/tab structure when possible.  
4. If tree IDs / monitor nodes missing → existing `reloadTree` + layout-group path.  
5. Tests: multi-mon fixture thrash (2→1→2, primary flip); assert windows not all under one monitor node when both heads alive.  
6. Manual on `black`: dual tile → idle lock or DPMS → wake → placement + retab.

## Acceptance

- [x] Overnight-style thrash (or simulated) does not leave all tiles on one monitor when both heads are up  
- [x] Manual lock still fine (path unchanged; no eager rehome on thrash)  
- [x] Retab/stack after rehome does not crash Shell (uses existing preserve-container + layout-group fallback)  
- [x] Unit/regression coverage for rehome mapping  
- [x] Harden plan + PRIORITY updated; brief DESIGN.md note if non-obvious  
- [ ] Manual overnight verify on `black` (follow-up smoke)

## Session notes

**2026-07-23 (implement):** H1 soft rehome shipped.

- `utils.js`: `rectIntersectionArea`, `bestMonitorIndexForRect`
- `window.js`: last-good WeakMap snapshot after quiet render; workareas debounce 200ms; suppress `_onWindowEnteredMonitor` while thrash pending; settle assigns `move_to_monitor` then `_reconcileWindowHomes` + render; missing dest → `reloadTree`
- Tests: `bug-h1-soft-rehome-workareas-thrash.test.js`; updated bug-078 / n0s7; utils unit
- Docs: `docs/user/monitors.md`, `troubleshooting.md`, `docs/DESIGN.md`

Next: manual blank/wake on black; then H2/H3 or resize per plan.
