# forge-layout-ws-orphan-min-float-dnd — Layout thrash, false float, dead dropzones

**Status:** parked — resume after OH1 plog logging is usable
**Plan:** (none) · blocked-on [forge-observability-hardening](../plans/forge-observability-hardening.md)
**Branch:** master
**Blocker:** (none) — priority gate: OH1 first
**Updated:** 2026-08-21

## Goal

Fix three coupled host bugs:
1. `forge layout vinyl` on ws2 fails `phase=size` ("size targets not under common parent") and mutates/closes windows on other workspaces; subsequent `layout dev` open-miss.
2. Windows float spuriously (journal `overflow-float`) from false min-learn / poisoned `window-mins.json`.
3. Titlebar drop zones die after launches / float — sticky or consequence of (2).

## Acceptance

- [ ] ApplyLayout snapshot / `collectWindows` must not claim/close other-workspace windows when applying on one ws
- [ ] `_sizeOp` soft-skips (like order) when mon-directs lack a common parent — no hard apply abort after closes
- [ ] CLI must not say "nothing applied" when bind/order already mutated
- [ ] `noteWindowMinFromClamp` requires frame below prior; no live size-changed learn; absurd caps reject half-pane poison
- [ ] `rehomeIfSlotTooSmall`: if Meta frame already fits slot → ratchet mins down, do not float
- [ ] Unmanaged mid-grab clears `_draggedNodeWindow` / GRAB_TILE / stage track
- [ ] L0 tests for the above; nest smoke when code path needs Shell

## Context for the next agent

- Root: `_snapshotForestForApply` dumps all other-ws WINDOWs into `orphanWindows`; `filterForestWorkspace` only filters `monitors`; `collectWindows` merges orphans → clean closes foreign desks.
- Order soft-skips cross-MONITOR; size hard-fails same race after irreversible closes.
- Poisoned Chrome PWA floors 879–1120 in `~/.config/forge/config/window-mins.json`.
- DnD: FLOAT never enters GRAB_TILE paint; all-red zones from huge mins.

## Session note

Implementing RC1–RC5 now.
