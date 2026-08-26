# Task — H1 soft rehome: manual blank/wake verify on black

**Status:** Done (folded into daily-driver T3)  
**Plan:** [forge-harden-and-session.md](../../forge-harden-and-session.md)  
**Priority:** P1  
**Kind:** Plan-linked  

## Acceptance

- [x] `make dev` / update-jcrussell installed; extension ACTIVE (jcrussell dirty)
- [x] Idle lock + DPMS → wake: windows not all stuck on one monitor (dual OK)
- [x] Retab after wake: no Shell abort
- [x] Notes filled; PRIORITY + plan updated

## Session notes

**2026-07-24:** Live verify on black via T3. Idle+DPMS dual-head pass; tab pair
survived; Super+x retab after wake OK. Soft-rehome tab survival code also
shipped (majority cluster + restore-if-unwrapped). See
[T3 completed](../../forge-daily-driver/completed/forge-daily-driver_t3-blank-wake-tabs.md).

**2026-07-23:** Tooling + CSS fix shipped; live verify was still open.
