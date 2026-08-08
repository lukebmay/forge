# forge (lukebmay) — active priorities

**Updated:** 2026-08-08  
**Lens:** `black` dual 4K Shell 46 — **Wayland and X11 daily drivers**  
**No push** until human asks.

**Active P0:** cold layout topology — **CT2 Wayland live** (CT1 code done)

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [CT2 Wayland live](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) | **ready** (next; operator) |
| P0 | [CT3 X11 live](./tasks/forge-layout-cold-topology_ct3-x11-live.md) | ready (required; parallel CT2) |
| post | [cleanup cold fallbacks](./tasks/forge-layout-cold-topology_cleanup-fallbacks.md) | after CT2+CT3 green |
| mid | Merge DnD plan branch | when ready |
| mid | [window ignore mode](./tasks/forge-window-ignore-mode.md) | ready |
| post | container motion, SL3, … | later |

**Done this session:** [CT1 skeleton](./plans/forge-layout-cold-topology/completed/forge-layout-cold-topology_ct1-skeleton.md) (unit/code A/B).

**Cross-repo displays:** shellrc [gdisplays-session-greeter](../../shellrc/agents/plans/gdisplays-session-greeter.md) GS0–GS5.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [plan cold-topology](./plans/forge-layout-cold-topology.md) | Architecture + CT0 lock + tasks |
