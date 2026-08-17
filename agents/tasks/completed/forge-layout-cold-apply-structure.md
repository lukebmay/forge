# forge-layout-cold-apply-structure — Cold ApplyLayout structure + soft (R036)

**Status:** ready (host cold verify → [forge-layout-cold-host-verify](./forge-layout-cold-host-verify.md))  
**Plan:** (none) · residual of AL6/AL8 open + R033 aspect + R035 ensure → SM1–SM7  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Regression:** [R036](../REGRESSIONS.md)

## Goal

True-cold Wayland host `forge layout dev` exits **ok** with topology matching
the profile. Code path is SM1–SM7 (ApplyEpoch, in-slot hard, open-into-slot,
machines, focus, overlay, no belt). Live host sign-off is the agent task
[forge-layout-cold-host-verify](./forge-layout-cold-host-verify.md).

## Acceptance

- [x] Root confirmed in code (PlaceNext mon thrash; PH stubs; soft abort;
      entered-monitor rehome during apply)
- [x] SM1–SM7 implement (epoch · in-slot · open-into-slot · machines ·
      focus · overlay · belt delete) — see
      [completed/](../plans/forge-layout-slot-machines/completed/)
- [x] L0 combined SM suite green (epoch/slot/settle/run/open/H1 …)
- [x] Nest mon=1 `_forge-test-clean` PASS (this session)
- [x] Mid-session host (pre-SM tip era): structure green after re-apply
- [ ] Host cold after logout tip — **agent-owned**:
      [forge-layout-cold-host-verify](./forge-layout-cold-host-verify.md)

## Context

Historical cold fail: mon1 empty / mon0 thrash while CLI said ok (belt-era).
Product fix is slot-machine apply (D039–D043), not more belt.

Human only: **logout + login**, restart agents. Agents install (already done
pre-commit), cold-apply, tree, journal, fix or residual.

## Session note

**2026-08-16:** Code + nest clean done in SM1–SM7 session. Live host cold
moved to agent task `forge-layout-cold-host-verify` so human does not run
layout manually.
