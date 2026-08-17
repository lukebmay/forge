# forge-tab-groups-cross-mon_d0-discussion — Tab/stack groups that straddle monitors

**Status:** done (locked 2026-08-16)
**Plan:** (none) — lock also in
[tab planning](./forge-tab-work-planning.md) · [D044](../../docs/DECISIONS.md)
**Branch:** master (default)
**Blocker:** (none)
**Priority:** folded into tab D0 — implement
[same-mon](./forge-tab-groups-same-mon.md)
**Updated:** 2026-08-16

## Goal

Design lock for TABBED/STACKED groups whose members live on different
monitors. **No implementation in this task.**

## Lock (2026-08-16)

**Unsupported as product.** One TABBED/STACKED CON = one monitor
(one strip + one pane + one slot). No spanning chrome. A single app
across heads is FLOAT/Meta, not a tab group.

**Survival only:** H1 majority-align
(`alignMonitorRecoveryGroupTargets`); R016 mon-loss collect-to-end as
a group. Do not change those defaults.

**Normalize:** mixed-mon members rehome to the CON’s MONITOR ancestor;
keep the group; do not auto-peel. Home is the **tree** ancestor, not
Meta `get_monitor()`.

**Join across mons:** move-then-join onto dest (DnD CENTER +
`merge-group`). One-tab keyboard mon-move peels that leaf (LX3).
Whole-group move is FCC C4 later. No profile span sugar.

**Human lock:** operator asked because straddles were surprising
(2026-08-11). D0 treats that as “should not happen,” not “build span.”

## Agenda (closed)

1. Supported product? **No** — accidental / thrash only.
2. Chrome / open-leaf / DnD across heads? **No** spanning strip.
   Join = dest-mon merge. Open-leaf stays `lastTabFocus` on that CON.
3. Normalize: **yes** — all members → CON MONITOR ancestor.
4. Mon-loss collect + H1: **unchanged**.
5. Profile span sugar: **none**.
6. Tests: L0 peel vs dest-mon join on the implement task. Live only
   if that slice needs nest `--monitors=2`.

## Acceptance

- [x] Options + recommendation written
- [x] Explicit lock: unsupported + normalize
- [x] Follow-up implement:
      [forge-tab-groups-same-mon](./forge-tab-groups-same-mon.md)
- [x] No production code in this D0 file

## Non-goals

- Implementing cross-mon tab chrome (rejected).
- Changing mon-loss collect default (R016 locked).

## Context for the next agent

Implement [same-mon](./forge-tab-groups-same-mon.md). Full write-up:
[tab planning](./forge-tab-work-planning.md).

## Session note

**2026-08-16:** Tab D0 locked unsupported + D044 normalize. Implement
task opened. Historical open note 2026-08-11 superseded by the lock.
