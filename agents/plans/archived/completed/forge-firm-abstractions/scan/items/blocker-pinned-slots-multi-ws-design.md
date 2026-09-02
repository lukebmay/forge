# blocker-pinned-slots-multi-ws-design

**Verdict:** post-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/blockers/pinned-slots-multi-ws-design.md

## Stated status
open — soft / mid / design / P2; human-only; does not block current P0.

## Leftovers
- Entire checklist unlocked: pin unit (Meta vs forge slot vs TABBED/STACKED CON), ws scope, same-geom vs per-ws placement, layout-profile apply, D044 distinction, focus/open-leaf/tab strip, CLI/JSON surface, Wayland vs X11 / empty-ws
- No implement slices until ACK
- Task stub path in the blocker (`agents/tasks/forge-pinned-slots-multi-ws_d0-discussion.md`) is stale — live D0 is `agents/plans/forge-pinned-slots-multi-ws/d0-discussion.md`

## Why this verdict
Human design meeting, not kernel. Option 2 TOM lift must not wait on sticky slots. Deep conflict surface (ApplyEpoch, D044, session-layout, per-ws tree) is exactly why it stays a **blocker**, not a keep-parallel campaign. **Not D044** (ws-span vs mon-span). PRIORITY already says do not start until the operator schedules the meeting.

## Destination
Keep the blocker open; PRIORITY parked post-refactor next to `forge-pinned-slots-multi-ws`. Do not close, do not absorb as a P1 kernel slice, do not implement.

## Absorb
- Distinction FIRM: this is cross-**workspace** slot sharing; D044 groups stay **mon-local**
- Pin slots (comms/media chrome) vs workspace-unique project tiles
- Related current model: workspace-scoped apply / orphans; tree is per-ws today
- Agent prep: park only; no code
