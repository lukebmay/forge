# Task: forge-layout-control-loop_cl6-debug-verify-interval

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Completed:** 2026-08-05

## Goal

Optional debug periodic layout verify gsetting (default 0 = off).

## Acceptance

All met (A + B AGREE). npm test 2095 green.

## Session note

**2026-08-05:** CL6 done — `layout-verify-interval-ms` (u, default 0), controller timer → `requestVerify("periodic")`.
