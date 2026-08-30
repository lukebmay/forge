# B-settled-slot-authority — Design meeting: settled slot authority

**Status:** closed
**Owner:** agents (implementation) / human (ε starting-value sign-off at S6)
**Kind:** design → implementation
**Plan:** [forge-settled-slot-authority](../plans/archived/completed/forge-settled-slot-authority.md)
**Unblocks:** (met — S8 closeout)
**Priority:** —
**Updated:** 2026-08-30
**Closed:** 2026-08-30 — S1–S6 shipped; S7 skipped; S8 done

## What landed in the meeting

- [x] Design meeting — locks in plan § Locked architecture (D095)
- [x] CHANGELOG **D095** + `design.md` geometry-authority section
- [x] S1 measurement + nest `smoke-geom-epsilon`; **ε₀ = 4** locked
- [x] S2 window model in host bag (`desiredRect`/`commanded`/`observed`/`slotGen`; nest `skip-stable`)
- [x] S3 primary present visible-first (`Tree.apply` open-before-buried; nest tabbed-edge)
- [x] S4 composable `./install --dev=` modes + `strict-geometry` heal gates
- [x] S5 demote/delete opportunistic heals (deleted, not gated); ensure-meta evidence-only; zoom reassert removed
- [x] S6 progressive forgiveness (per wm-class) + fault-inject harness green; near-band `max(2×ε,ε+8)`
- [x] S7 zoom primary-path fixes — **skipped** (no repro after S5; only if regresses)
- [x] S8 closeout (HANDOFF / PRIORITY / this blocker)

## Done when

- [x] Plan slices S2–S6 (and S7 if needed) per plan closeout rules
- [x] Opportunistic post-render / epoch-end / join geometry-force gone or explicit wontfix with metrics (**S5: gone**)
- [x] Progressive forgiveness only if fault-inject green (**S6: green**)

## Leftover (not blocker scope)

D026 `_restoreTileToSlot` / `_schedulePostEchoSlotReassert` still
`{ force: true }` — known geometry-force debt outside opportunistic heal
waves. Noted on archived plan + PRIORITY/HANDOFF; not closed as “done.”

## Notes

Hunt measurement: `forge log --grep geom-epsilon` (DEBUG writes; TRACE skip-agree).
Class bump: `forge log --grep class-eps-bump`.
