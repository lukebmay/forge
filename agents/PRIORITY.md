# forge (lukebmay) — active priorities

**Updated:** 2026-08-08  
**Lens:** `black` dual 4K Shell 46 — **X11 preferred for agent live test**; Wayland daily driver too  
**Push:** only when human asks (this session: wrap-up push requested).

**Active P0:** **layout settle contract** (hard + soft expectations) — then CT3 cold smoke

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [settle contract SE0→SE8](./plans/forge-layout-settle-contract.md) | **next** — design lock + implement |
| P0 | [CT3 X11 live](./tasks/forge-layout-cold-topology_ct3-x11-live.md) | after SE4+; prove one-shot cold |
| P0 | [cleanup strip](./tasks/forge-layout-cold-topology_cleanup-fallbacks.md) | code landed; close after CT3 + settle |
| P0 | [CT2 Wayland live](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) | operator logout when needed |
| mid | Merge DnD plan branch | when ready |
| mid | [window ignore mode](./tasks/forge-window-ignore-mode.md) | ready |
| mid | [settle-learning SL3](./plans/forge-settle-learning.md) | absorb into settle-contract SE6+ |
| post | container motion, … | later |

**Handoff doctrine:** [HANDOFF.md](./HANDOFF.md) — spine over band-aids; no personal-layout code.

**Cross-repo displays:** shellrc [gdisplays-session-greeter](../../shellrc/agents/plans/gdisplays-session-greeter.md) GS0–GS5.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft settle + focus thrash |
| [cold topology](./plans/forge-layout-cold-topology.md) | Skeleton→bind spine |
| [REGRESSIONS.md](./REGRESSIONS.md) | Guard spine with abstract tests |
