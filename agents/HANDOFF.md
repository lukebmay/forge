# Handoff — forge (lukebmay)

**Updated:** 2026-08-08 (tasks complete for cold topology + cross-link gdisplays)  
**Branch:** `master` → implement on `plan/forge-layout-cold-topology`  
**Sessions:** **Wayland and X11 are both daily drivers** (X11 on older machines)

---

## Start here

| Pri | Work | Path |
| --- | --- | --- |
| **P0** | Cold layout topology **CT0 design** | [plan](./plans/forge-layout-cold-topology.md) · [CT0](./tasks/forge-layout-cold-topology_ct0-design.md) |
| → | CT1 skeleton implement | [CT1](./tasks/forge-layout-cold-topology_ct1-skeleton.md) |
| → | CT2 Wayland live · CT3 X11 live | [CT2](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) · [CT3](./tasks/forge-layout-cold-topology_ct3-x11-live.md) |
| shellrc | gdisplays session/greeter (GS0+) | `~/dev/me/shellrc/agents/plans/gdisplays-session-greeter.md` |

---

## Architecture lock (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Settle thrash (AC1–AC6) | Done — residual geom = echo |
| Cold Mode B second pass | **Not** the product fix — skeleton-first one-shot |
| Thrash mid-batch | Forbidden while layout ops in flight |
| Tree shape vs bind | Shape first; async bind to slots OK |
| X11 | Daily driver parity (CT3), not optional |

---

## Operator after login

1. `gdisplays --status` — if scale wrong: `gdisplays load default`  
2. Greeter wrong: `gdisplays --user-to-login` until GS2 write-through ships  
3. Agent: **CT0** (forge) and/or **GS0** (shellrc gdisplays)

---

## Open human blockers

- hard: resize-autotile-design  

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
