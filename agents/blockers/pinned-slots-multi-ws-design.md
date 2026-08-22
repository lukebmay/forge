# B-pinned-slots-multi-ws — Design: pin slots across workspaces

**Status:** open
**Severity:** soft (mid) — does **not** block current P0 queue
**Owner:** human
**Kind:** design
**Plan:** (none yet — design meeting produces plan + decisions)
**Unblocks:** implementation tasks after ACK (none filed until design)
**Priority:** P2 (mid)
**Created:** 2026-08-22
**Updated:** 2026-08-22

## Why this is human-only

Product idea with deep tree/workspace semantics. Easy to conflict with
ApplyEpoch, D044 mon-local groups, session-layout, and “one desk per ws”
mental model. Needs a deliberate lock before any code.

## Idea (operator)

Some **slots** (e.g. a TABBED YouTube / Gmail / Voice group) **follow the
user across all workspaces** (or a chosen set). Other slots stay
**unique per workspace**. Makes GNOME workspaces practical: shared
comms/media chrome travels with you; project/dev tiles stay on their ws.

## Design session must lock

- [ ] What is pinned: Meta window(s), forge **slot**, or TABBED/STACKED CON?
- [ ] Scope: all workspaces vs allowlist / denylist / sticky bit on slot
- [ ] Layout: shared slot occupies the **same mon geometry** on every ws,
      or per-ws placement with shared membership?
- [ ] Interaction with `forge layout <profile>` per-ws apply (orphan rules,
      close residuals, PlaceNext)
- [ ] Interaction with **D044** (groups mon-local) — this is **ws**-span,
      not mon-span; keep that distinction firm
- [ ] Focus / open-leaf / tab strip when switching ws
- [ ] CLI / profile JSON surface (`sticky`, `pin-ws`, …) — data only
- [ ] Wayland vs X11 constraints; empty-ws behavior

## Agent prep

- Do **not** implement. Park only.
- Related current model: workspace-scoped apply / orphans
  (`forge-layout-ws-orphan-…` shipped); tree is per-ws today
- Task stub: [forge-pinned-slots-multi-ws_d0-discussion](../tasks/forge-pinned-slots-multi-ws_d0-discussion.md)

## Done when

Durable design + decisions in-repo; severity can stay soft until
scheduled; implement slices filed only after ACK.
