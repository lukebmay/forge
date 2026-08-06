# forge-action-pipeline_ap5-live-x11-smoke

**Status:** in progress  
**Plan:** [forge-action-pipeline](../plans/forge-action-pipeline.md)  
**Branch:** `plan/forge-action-pipeline`  
**Created:** 2026-08-06  
**Depends:** AP2+ (AP4 preferred)  

## Goal

Live X11 HUP smoke of action-pipeline formulas on black dual 4K.

## Matrix (from plan)

| Gesture | Expect |
| --- | --- |
| Click mon0 Ghostty | mon1 tabs no flash |
| Tab switch | raise + strip; no ¼ height |
| Focus keys | borders follow; no forest reflow |
| Move / swap / drag | one settle each |
| `forge layout dev` | open batch clean |

## Agent can do

1. `./install` (debug/production=false) + enable logging
2. `killall -HUP gnome-shell` on X11
3. Optional: `forge tree` / plan dry-run checks post-layout
4. Record journal / session-layout-trace if available

## Operator must confirm (visual)

- Cross-mon tab flash absent
- Tab switch height stable
- Focus/move/swap look correct

## Acceptance

1. Debug install + HUP succeeds without Shell crash
2. Agent notes post-HUP tree / no SEGV
3. Operator visual checklist checked (or soft blocker if deferred)
4. Failures filed as follow-up tasks

## Session note

(overwrite)
