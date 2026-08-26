# forge-ws-switch-open-leaf-steal — WS return adopts wrong tab open leaf

**Status:** agent done (host tip verify open)
**Plan:** (none)
**Branch:** master
**Updated:** 2026-08-23

## Goal

Stop workspace switch from rewriting TABBED/STACKED `lastTabFocus` when Meta
restores focus to a non-open sibling (e.g. Voice visible after `layout vinyl`
round-trip).

## Acceptance

- [x] plog root cause (session `5S5eI`)
- [x] `afterFocus` preserves open leaf while `_workspaceChanging`
- [x] settle sweep `reassertOpenLeavesOnActiveWs` after WS transition
- [x] L0 action-pipeline + WindowManager-focus
- [x] `./install --dev` (Wayland tip deferred → logout)
- [ ] Host: `layout dev` → WS2 `layout vinyl` → back WS1; mon1 open leaf stays
      YouTube (not Voice)

## Cause (session 5S5eI)

1. `layout dev` ws0 focus-phase pinned open leaves (`revealGroupChild pin=true`)
   at 19:12:43 — pin TTL **15s**.
2. Leave WS0 (19:12:46): meta-focus stole open leaf; **pin-restore** worked.
3. `layout vinyl` ws1 OK (own YouTube id; orphans=0) — not a cross-ws tree mutate.
4. Return WS0 (19:13:10, **~27s** later): pin expired. Meta focused Voice;
   `afterFocus` → `updateTabbedFocus` adopted Voice as open leaf + raise.
5. Hunt lines: `afterFocus pin-restore` on leave; on return
   `moved pointer to [Google Voice…]` + Voice `FOCUS` with **no** pin-restore.

## Fix

- `restoreOpenLeafIfWorkspaceFocusSteal` + `afterFocus` early return when
  `_workspaceChanging`
- `reassertOpenLeavesOnActiveWs` on workspaceChanging timer clear
