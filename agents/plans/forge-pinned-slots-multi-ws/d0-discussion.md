<!-- migrated from agents/tasks/forge-pinned-slots-multi-ws_d0-discussion.md by agents migrate-layout -->

# forge-pinned-slots-multi-ws_d0-discussion — Design meeting: multi-ws pinned slots

**Status:** blocked
**Plan:** (none — created by design meeting)
**Branch:** master
**Blocker:** [pinned-slots-multi-ws-design](../blockers/pinned-slots-multi-ws-design.md)
  (soft · mid · design)
**Updated:** 2026-08-22

## Goal

Hold a mid-priority **design meeting** for pinning selected slots (e.g.
YouTube/email/voice tab group) so they follow the user across all or
specific workspaces, while other slots remain workspace-unique.

## Acceptance

- [ ] Design meeting held; durable plan/DECISION rows ACK’d
- [ ] Checklist in the blocker locked (pin unit, ws scope, layout, apply,
      D044 distinction, focus, profile surface)
- [ ] Implement slices filed only after ACK — **no code before design**
- [ ] Blocker marked done when design is written

## Context for the next agent

**Why it matters:** Workspaces today feel impractical because shared
“always with me” chrome (mail, chat, media) cannot travel without
duplicating or manually moving windows. Pinning **slots** (not whole
desks) would make multi-ws usable for daily drivers.

**Not this:** Cross-**monitor** TABBED (forbidden by D044). This feature
is cross-**workspace** sharing of selected slots.

**Priority:** P2 mid — **parked behind D100**. Do not jump ahead of the
thin adapter core. Promote only when operator schedules the meeting.

## Session note

Parked 2026-08-22 so the idea is not forgotten. Operator: “incredible
feature that would make lots of people actually use workspaces.”
