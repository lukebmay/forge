# B-settled-slot-authority — Design meeting: settled slot authority

**Status:** open (design **Accepted** as D095; implementation slices remain)
**Owner:** agents (implementation) / human (ε starting-value sign-off at S6)
**Kind:** design → implementation
**Plan:** [forge-settled-slot-authority](../plans/forge-settled-slot-authority.md)
**Unblocks:** heal demotion, progressive ε, zoom-reassert removal
**Priority:** P0

## What landed in the meeting

- [x] Design meeting — locks in plan § Locked architecture (D095)
- [x] CHANGELOG **D095** + `design.md` geometry-authority section
- [x] S1 measurement + nest `smoke-geom-epsilon`; **ε₀ = 4** locked

## Still open (implementation)

- [ ] S2 window model in host bag
- [ ] S3 primary present visible-first
- [ ] S4 composable `./install --dev=` modes
- [ ] S5 demote/delete opportunistic heals + forbid geometry-force
- [ ] S6 progressive forgiveness (per wm-class) + fault-inject
- [ ] S7 zoom primary-path fixes if needed
- [ ] S8 closeout (do **not** close while blanket heals remain default)

## Done when

- Plan slices S2–S5 (and S6 decision) per plan closeout rules
- Opportunistic post-render / epoch-end / join geometry-force gone or explicit wontfix with metrics
- Progressive forgiveness only if fault-inject green

## Notes

Hunt measurement: `forge log --grep geom-epsilon` (DEBUG writes; TRACE skip-agree).
