# B-manual-black-session-verify — Live session verify on black

**Status:** open  
**Severity:** hard  
**Owner:** human  
**Kind:** expensive-test  
**Plan:** forge-harden-and-session  
**Unblocks:** agents/plans/forge-harden-and-session.md; **RC confidence** on lock/DPMS/session  
**Priority:** P1  
**Created:** 2026-08-05  
**Updated:** 2026-08-08  

## RC relevance

**Still required** before calling a daily-driver release solid. Unit soft-rehome / monitor-recovery
are green; live blank/wake + real layout path remain operator-owned. Not design — live QA.

## What the human must do

- [ ] On host `black`, exercise DPMS blank/wake
- [x] Run real `gdisplays load` / layout path used daily (operator: cold layout OK 2026-08-08)
- [x] Run a real `forge layout dev` (or current daily layout) and confirm layout behavior
- [ ] Note any multi-monitor thrash or shell abort

## Done when

Daily-driver confidence is recorded, or new failure modes are filed as agent tasks.

## Context

Automated unit/regression for monitor-recovery landed; live multi-monitor/session checks remain
operator-owned. CLI rename: `workon` → `forge layout`.


## DPMS helper (2026-08-08)

Shellrc: `session-sleep` (also forge `scripts/forge/trigger-idle-lock.zsh`).

```sh
session-sleep status
session-sleep blank --hold=5 --force
session-sleep idle --idle-delay=12
session-sleep idle-blank --idle-delay=10   # closest to overnight
session-sleep lock --force
session-sleep suspend --force              # full system sleep
session-sleep restore                      # if timers left shortened
```
