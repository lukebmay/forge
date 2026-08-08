# B-manual-black-session-verify — Live session verify on black

**Status:** done  
**Severity:** hard  
**Owner:** human  
**Kind:** expensive-test  
**Plan:** forge-harden-and-session  
**Unblocks:** agents/plans/forge-harden-and-session.md; **RC confidence** on lock/DPMS/session  
**Priority:** P1  
**Created:** 2026-08-05  
**Updated:** 2026-08-08  
**Closed:** 2026-08-08  

## RC relevance

Layout path verified live. DPMS blank/wake deferred to redesigned `session-sleep`
testing API (operator later — not blocking RC for layout confidence).

## What the human must do

- [x] On host `black`, exercise DPMS blank/wake — **deferred** to `session-sleep` redesign
- [x] Run real `gdisplays load` / layout path used daily (operator: cold layout OK 2026-08-08)
- [x] Run a real `forge layout dev` (or current daily layout) and confirm layout behavior
- [x] Note any multi-monitor thrash or shell abort — none filed for this close; layout OK

## Done when

Daily-driver confidence is recorded, or new failure modes are filed as agent tasks.

**Closed:** operator layout OK 2026-08-08. Full DPMS matrix not required for this
blocker close; use shellrc `session-sleep` testing API later:

```sh
session-sleep status
session-sleep blank --force
session-sleep dpms --force
session-sleep wake
session-sleep lock --delay=3s suspend --force   # careful
session-sleep settings show
```

## Context

Automated unit/regression for monitor-recovery landed; live multi-monitor/session checks remain
operator-owned. CLI rename: `workon` → `forge layout`.
