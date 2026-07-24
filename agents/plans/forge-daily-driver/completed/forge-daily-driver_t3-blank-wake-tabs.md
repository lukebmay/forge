# Task — T3: Blank/wake verify + tab survival on soft rehome

**Status:** Done  
**Plan:** [forge-daily-driver.md](../../forge-daily-driver.md)  
**Also:** [h1-verify](../../forge-harden-and-session/completed/forge-harden-and-session_h1-verify.md)  
**Priority:** P1  
**Kind:** Plan-linked  

## Problem

After display blank/wake, some windows stay correct multi-mon, some **untab**,
some wrong place. Soft rehome (H1) is implemented + unit-tested; live dual-head
idle+DPMS verify was open. Partial CON migration unwraps tab groups.

## Goals

1. Live verify on black (idle+DPMS).
2. Tab survival under soft rehome (code + live).
3. Settle debounce for hybrid GPU thrash.
4. Record results.

## Acceptance

- [x] Unit tests for tab majority-align + restore-if-unwrapped + intact non-nest + partial peel
- [x] Soft rehome code path: majority cluster, layout-group restore, dead ignore
- [x] Idle+DPMS → wake: dual-head placement sane (black live 2026-07-24)
- [x] Pre-wake tabbed groups still tabbed after idle+DPMS (t3-a/t3-b same geom)
- [x] Retab after wake does not crash Shell (Super+x ungroup; shell stayed ACTIVE)
- [x] h1-verify acceptance covered by this task

## Session note

**2026-07-24:** Code + B AGREE + live black verify.

### Code

- `WORKAREAS_SETTLE_MS` 200 → 300
- `_alignSoftRehomeGroupTargets`: majority monitor for outermost STACKED/TABBED
- `tree.restoreLayoutGroupsIfUnwrapped`: skip intact; rejoin partial peel; full-flat rebuild
- `_containerFullyMigrates` ignores dead siblings
- Tests: `bug-h1-soft-rehome-workareas-thrash.test.js` (4 new); `npm test` 171/1635
- B verify: **AGREE**

### Live (black, X11, dual 5K-scaled, jcrussell dirty install)

1. `update-jcrussell.zsh --force --save --restart-shell` → T3 code live  
2. Clean layout: Ghostty mon0; gnome-terminal t3-a/t3-b tabbed mon0; t3-c mon1  
3. **DPMS off/on:** DUAL OK, tabs same geom  
4. **idle-and-dpms (8s) + unlock:** DUAL OK, TAB_PAIR_SAME_GEOM=YES, Ghostty alive  
5. **Retab Super+x after wake:** ungrouped as expected; Shell ACTIVE; dual still OK  
6. No JS ERROR / shell abort in journal during thrash  
7. Did **not** use xrandr mon-off or gdisplays for final pass (avoids Keep dialog)

**Next:** T4 sizing policy.
