# Task — T3: Blank/wake verify + tab survival on soft rehome

**Status:** Ready after T1 (and install)  
**Plan:** [forge-daily-driver.md](../plans/forge-daily-driver.md)  
**Also:** [h1-verify](./forge-harden-and-session_h1-verify.md), [harden plan](../plans/forge-harden-and-session.md)  
**Analysis:** blank/wake sections  
**Priority:** P1  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-daily-driver/completed/` (and close/move h1-verify if fully covered)

## Problem

After display blank/wake, some windows stay correct multi-mon, some **untab**,
some wrong place. Soft rehome (H1) is implemented + unit-tested; **live dual-4K
idle+DPMS verify still open**. Partial CON migration unwraps tab groups.

## Goals

1. Complete live verify procedure from h1-verify on **black** (user runs shell/SSH with **explicit** permission if remote).
2. If tabs unwrap under soft rehome: code fix —
   - snapshot/restore layout groups (or fuller snapshot) **around** soft rehome settle, not only `reloadTree`
   - relax `_containerFullyMigrates` (majority / last-good cluster) so tab CONs move as units more often
3. Adjust settle debounce if thrash >200ms on hybrid GPU.
4. Record results in plan session notes.

## Tooling

See h1-verify: `scripts/forge/trigger-idle-lock.zsh --idle-and-dpms`, `reload-theme.zsh`, etc.

## Code touch list (if verify fails)

| Area | Symbols |
| --- | --- |
| Soft rehome | `window.js` → `_softRehomeAfterWorkareas`, `_reconcileWindowHomes`, `_rehomeWindowPreservingContainer`, `_containerFullyMigrates` |
| Groups | `tree.js` → `snapshotLayoutGroups`, `restoreLayoutGroups` |
| Tests | extend `bug-h1-soft-rehome-workareas-thrash.test.js` |

## Acceptance

- [ ] Idle+DPMS → wake: dual-head placement sane
- [ ] Pre-wake tabbed groups still tabbed (or documented residual + follow-up)
- [ ] Retab after wake does not crash Shell
- [ ] Unit tests for any new rehome path
- [ ] h1-verify acceptance checked or superseded by this task’s note

## Security

Do **not** SSH to black without the user’s **explicit** permission (AGENTS.md).

## Session note

(empty — next agent fills)
