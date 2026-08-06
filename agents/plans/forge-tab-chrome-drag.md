# Plan: Browser-like tab chrome drag

**Status:** ready / **deferred** (lower priority)  
**Priority:** P2 — after dual-session core + workspace-scoped layouts  
**Created:** 2026-08-06  
**Branch:** `plan/forge-tab-chrome-drag` (create when starting)  

### Session note (overwrite)

**2026-08-06:** Operator: mouse tab drag did **not** behave like browser tabs
(reorder / peel to split / join another group). LX4 landed unit-level
tab→grab-tile plumbing; product DnD still missing or not live-visible.
Park behind workspace scope + X11/Wayland daily path.

---

## Why

Expected UX (browser tab model):

| Gesture | Intent |
| --- | --- |
| Drag tab along strip | **Reorder** within the same TABBED/STACKED group |
| Drag tab out of strip onto tile area | **Peel** into split (or float — product choice) |
| Drop onto another tab strip | **Join** that tab/stack group |
| Drop onto a split edge / pane | Insert as new tile in that container |

Today: keybind move works; mouse tab drag is incomplete for daily use.

## Depends on (do not start early)

1. [forge-layout-workspace-scope](./forge-layout-workspace-scope.md) — desks stable  
2. X11 + Wayland residual smoke green enough for daily driver  
3. Prefer action-pipeline stages for any new DnD commit path  

## Non-goals (v1)

- Full Firefox/Chrome parity (pinned tabs, multi-window tab tear-off OS-level)
- Replacing keybind move/swap
- Nested-tab product push (selection S4)

## Tasks (draft — finalize when plan promoted)

| ID | Work | Status |
| --- | --- | --- |
| **TD0** | Live inventory: what LX4 grab path does on black X11/Wayland | draft |
| **TD1** | Reorder within strip | draft |
| **TD2** | Peel-out drop zones (split insert) | draft |
| **TD3** | Join existing tab/stack strip | draft |
| **TD4** | Docs + cheatsheet pointer | draft |

## Related

- LX4 completed (unit): [forge-layout-live-x11_lx4-tab-drag](./forge-layout-live-x11/completed/forge-layout-live-x11_lx4-tab-drag.md)
- Peel geometry / slivers: see operator discussion 2026-08-06 (aspect wrap vs reparent)
