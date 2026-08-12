# forge-tab-groups-cross-mon_d0-discussion — Tab/stack groups that straddle monitors

**Status:** ready  
**Plan:** (none) — design discussion only  
**Branch:** master (default)  
**Blocker:** (none)  
**Priority:** later (product edge; not daily-driver P1)  
**Updated:** 2026-08-11

---

## Goal

Capture a **design lock** for TABBED/STACKED (and nested CON) groups whose members live on **different monitors** — intentional multi-mon tab groups, peel after thrash, or “app spanning monitors.” **No implementation in this task.**

---

## Why this exists

R016 / display-settle work assumed mon-scoped forests. Monitor-recovery already **majority-aligns** outermost STACKED/TABBED targets so a group migrates as a unit during thrash — that is a **survival** rule, not a product feature for intentional cross-mon tabs.

Operator note (2026-08-11): “I didn’t know tab groups could straddle monitors. We probably need a design discussion on how to handle that (if someone wants an app to span monitors).”

---

## Discussion agenda (fill during D0)

1. **Is cross-mon TABBED/STACKED a supported product feature**, or only an accidental thrash state?
2. If supported: how does chrome (tab strip) render across heads? Focus / open-leaf? DnD join across mons?
3. If unsupported: **normalize** on detect — force group onto one mon (which?), or forbid join across mons in drag/keyboard?
4. Interaction with **mon-loss collect** (collect-to-end-of-survivor as group) and H1 majority-align.
5. Session layout / layout profiles: portable mon fields per leaf already exist — any sugar for “span”?
6. Tests: L0 cases for peel vs intentional join; live only if product-on.

---

## Acceptance

- [ ] Options + **recommendation** written in this file (or linked plan) after human discussion.
- [ ] Explicit **user lock** on supported vs unsupported.
- [ ] Follow-up implement tasks drafted only after lock.
- [ ] No production code required for D0 completion.

---

## Non-goals

- Implementing cross-mon tab chrome.
- Changing mon-loss collect default (collect missing mon → end of survivor tree as group — locked under R016).

---

## Context for the next agent

- H1 majority-align: `MonitorRecoveryManager.alignMonitorRecoveryGroupTargets` — thrash survival only.
- Mon-loss product (R016): collect dead mon apps to **end of survivor mon tree as a group**; new mon stays empty; no H/V geometry inference.
- Related: [forge-monitor-noop-apply-thrash](./forge-monitor-noop-apply-thrash.md), DESIGN § Monitor-recovery (H1).

## Session note

**2026-08-11:** Opened from R016 display-settle product discussion. Design only.
