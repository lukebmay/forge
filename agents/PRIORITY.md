# forge (lukebmay) — active priorities

**Updated:** 2026-08-08  
**Lens:** `black` dual 4K Shell 46 — **Wayland and X11 daily drivers**  
**No push** until human asks.

**Active P0:** cold layout topology (CT0 → one-shot; no Mode B patch)

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [cold-topology CT0 design](./tasks/forge-layout-cold-topology_ct0-design.md) | **ready** |
| P0 | [CT1 skeleton](./tasks/forge-layout-cold-topology_ct1-skeleton.md) | after CT0 |
| P0 | [CT2 Wayland live](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) | after CT1 |
| P0 | [CT3 X11 live](./tasks/forge-layout-cold-topology_ct3-x11-live.md) | after CT1 (required) |
| mid | Merge DnD plan branch | when ready |
| mid | [window ignore mode](./tasks/forge-window-ignore-mode.md) | ready |
| post | container motion, SL3, … | later |

**Cross-repo displays:** shellrc [gdisplays-session-greeter](../../shellrc/agents/plans/gdisplays-session-greeter.md) GS0–GS5.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [plan cold-topology](./plans/forge-layout-cold-topology.md) | Architecture + tasks |
