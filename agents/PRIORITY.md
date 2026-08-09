# forge (lukebmay) — active priorities

**Updated:** 2026-08-08  
**Lens:** `black` dual 4K Shell 46 — **X11 preferred for agent live test**; Wayland daily driver too  
**No push** until human asks.

**Active P0:** **patch cleanup / architecture holds the weight** (not more belt/focus band-aids)

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [cleanup — strip cold/open patchwork](./tasks/forge-layout-cold-topology_cleanup-fallbacks.md) | **next** — audit keep/demote/delete; delete weight |
| P0 | [CT3 X11 live](./tasks/forge-layout-cold-topology_ct3-x11-live.md) | ready (agent HUP smoke after cleanup progress) |
| P0 | [CT2 Wayland live](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) | operator logout when needed |
| mid | Merge DnD plan branch | when ready |
| mid | [window ignore mode](./tasks/forge-window-ignore-mode.md) | ready |
| post | container motion, SL3, … | later |

**Handoff doctrine:** [HANDOFF.md](./HANDOFF.md) — why patches are bad; spine over band-aids; no personal-layout code.

**Cross-repo displays:** shellrc [gdisplays-session-greeter](../../shellrc/agents/plans/gdisplays-session-greeter.md) GS0–GS5.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [plan cold-topology](./plans/forge-layout-cold-topology.md) | Architecture + CT0 lock + tasks |
| [REGRESSIONS.md](./REGRESSIONS.md) | Guard spine with abstract tests |
