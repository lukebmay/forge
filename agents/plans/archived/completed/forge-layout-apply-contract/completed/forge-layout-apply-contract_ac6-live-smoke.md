# Task: forge-layout-apply-contract_ac6-live-smoke

**Status:** done  
**Plan:** [forge-layout-apply-contract.md](../../forge-layout-apply-contract.md)  
**Branch:** `plan/forge-layout-apply-contract` (= master tip `47b4f91`)  
**Created:** 2026-08-07  
**Completed:** 2026-08-07  
**Depends:** AC1–AC5 done  
**Host:** black X11 dual 4K — agent install + live layout (explicit HUP permission)

## Goal

Live-smoke the apply/settle contract on X11 after AC1–AC5.

## Acceptance

1. [x] Session is X11 (HUP-capable).  
2. [x] `forge layout dev` completes without hang/timeout storm.  
3. [x] Tree matches dual-mon dev profile structure (tabs + ghosttys).  
4. [x] Default apply does not require `--wait-tree-stable` (`treeStable.skipped`).  
5. [x] No Shell crash; forge still pingable.  
6. [x] Session notes on task + plan.

## Session note

**2026-08-07 (AC6 live X11):**

| Check | Result |
| --- | --- |
| Session | `XDG_SESSION_TYPE=x11`, `DISPLAY=:1` |
| Install | `./install` debug (`production=false`); extension ACTIVE `v49-90-beta.2-231-g47b4f91` |
| LF6 default | Cold open `apply.treeStable = {skipped: true}`; help documents opt-in flag |
| Map-pin wait | Cold open `openMapWait` ok, ~414ms, 5/5 roles pinned |
| LayoutBatch | begin/release-deferred ok; released 5 deferred maps |
| Settled desk | mon0 `TABBED(chrome,Grok) \| ghostty`; mon1 `ghostty \| TABBED(YT,Gmail,Voice)` |
| Mode | After recover: Mode A collect, 7 reused / 0 open / 0 structure |
| Crash | none; `forge ping` ok |

**Cold open residual (not AC6 fail):** first multi-open from dual Ghostty can land wrong mon / messy nest; Mode B thrash-recover + a second `forge layout dev` reaches profile structure. Direct `id→id` moves stick; path mon moves also work when quiet. Chrome role often matches `about:blank` / Amazon tab (wmClass) — role identity quirk, not settle contract.

**Contract confirmations:** no default fingerprint quiet; streaming map-pin + residual RunSteps; sensor/epoch path does not storm Shell; thrash catalog still has diagnostic samples (`forge thrash`).

**AC7 residual nudge:** **cancelled** (2026-08-08) — visual QA fine without.
