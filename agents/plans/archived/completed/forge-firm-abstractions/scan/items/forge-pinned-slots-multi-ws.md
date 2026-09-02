# forge-pinned-slots-multi-ws

**Verdict:** post-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-pinned-slots-multi-ws/d0-discussion.md

## Stated status
blocked / D0 parked (2026-08-22); no implement until design meeting ACK.

## Leftovers
- Entire feature: design meeting never held
- Acceptance: lock pin unit, ws scope, layout, apply, D044 distinction, focus, profile surface; then file implement slices
- Related proto defer: Mark 2 D11 shared monitors — **not** this feature (monitors vs slots)

## Why this verdict
Real product idea, not TOM kernel. Option 2 does not need sticky slots to lift the tree. Easy to conflict with ApplyEpoch, D044 mon-local groups, session-layout, and “one desk per ws.” Operator already said: do not start this meeting until scheduled. **Not D044** (D044 forbids cross-monitor TABBED; this is cross-**workspace** sharing of selected slots). Keep-parallel would steal the refactor; abandon would lose a named daily-driver win.

## Destination
PRIORITY parked post-refactor, gated on `blocker-pinned-slots-multi-ws-design`. Operator schedules the design meeting; no code before ACK. After L0 merge, this D0 stub may stay as the parked plan spine (or fold into a thin plan when the meeting happens).

## Absorb
- Pin **slots**, not whole desks; other slots remain workspace-unique
- Cross-workspace ≠ cross-monitor; keep D044 mon-local groups firm
- Tree is per-ws today; workspace-scoped apply / orphan rules already shipped
- Do not implement; do not confuse with Mark 2 D11 shared monitors
