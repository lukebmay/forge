# B-ap5-operator-visual-matrix — AP5 visual gesture matrix on X11

**Status:** open  
**Severity:** soft  
**Owner:** human  
**Kind:** verify  
**Plan:** forge-action-pipeline  
**Unblocks:** full AP5 sign-off (agent install/HUP already green)  
**Priority:** P1  
**Created:** 2026-08-06  
**Updated:** 2026-08-06  

## RC relevance

**Still relevant** for release quality, not a code gate. Agent AP5 + install already green;
this is eyes-on confirmation that gestures feel one-settle / no flash. Soft — do not block
agent queue. Prefer after workspace-scope + X11 RC smoke if time is short.

## What the human must do

On **X11** black after action-pipeline install (already HUP’d agent-side):

- [ ] Click mon0 Ghostty → mon1 tabs **no flash**
- [ ] Tab switch → raise + strip; **no ¼ height**
- [ ] Focus keys → borders follow; **no forest reflow**
- [ ] Move / swap / drag → **one settle** each
- [ ] Optional: `forge layout dev` apply → open batch clean

## Done when

Checklist ticked or failures filed as agent tasks.

## Context

Agent AP5: install + HUP no SEGV; extension ACTIVE; `npm test` green.
See completed task note under `plans/forge-action-pipeline/completed/`.
