# B-manual-black-session-verify — Live session verify on black

**Status:** open
**Owner:** human
**Kind:** expensive-test
**Plan:** forge-harden-and-session
**Unblocks:** agents/plans/forge-harden-and-session.md
**Priority:** P1

## What the human must do

- [ ] On host `black`, exercise DPMS blank/wake
- [ ] Run real `gdisplays load` / layout path used daily
- [ ] Run a real `workon dev` (or current daily workon) and confirm layout behavior
- [ ] Note any multi-monitor thrash or shell abort

## Done when

Daily-driver confidence is recorded, or new failure modes are filed as agent tasks.

## Context

Automated unit/regression for soft rehome landed; live multi-monitor/session checks remain operator-owned.
