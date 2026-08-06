# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (workspace-scoped layouts queued; tab-drag deferred)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed (content **applied** to control-loop). Drop only after human OK — see [HANDOFF.md](./HANDOFF.md).

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Layout workspace scope** | Desks = workspaces; stop cross-ws steal — [plan](./plans/forge-layout-workspace-scope.md) |
| **2** | **AP5 op visual** (soft) | Gesture matrix eyes-on — [blocker](./blockers/B-ap5-operator-visual-matrix.md) |
| **3** | **Wayland residual smoke** | After operator Wayland login — [task](./tasks/forge-wayland-live_residual-smoke.md) |
| **4** | **Container selection S3+** | After rebase `plan/forge-first-class-containers` ← master |
| **5** | **Desktop keybinds KB1–4** | After S3 |
| **later** | **Tab chrome drag (browser-like)** | P2 — [plan](./plans/forge-tab-chrome-drag.md) |

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **WS0** | Claim/plan one workspace only | [task](./tasks/forge-layout-workspace-scope_ws0-claim-scope.md) |
| **2** | **WS1** | Apply + current workspace | [task](./tasks/forge-layout-workspace-scope_ws1-apply-current.md) |
| **3** | **WS2** | CLI sequential + `W:name` / `name@W` | [task](./tasks/forge-layout-workspace-scope_ws2-cli-grammar.md) |
| **4** | **WS3** | Docs + live dual-ws | [task](./tasks/forge-layout-workspace-scope_ws3-docs-live.md) |

**Shipped on master (local, not pushed)**

| Item | Note |
| --- | --- |
| CL0–CL11 + action pipeline AP0–AP5 agent | control-loop + pipeline |
| **LX1–LX4** | live X11 layout bugs (tab drag still weak live — see TD plan) |
| **mon-order X11** | bare dual arrays physical L→R — `0e8c2f7` |
| **MR0–MR2** | monitor-recovery rename — `ed77e04` + residue `b9e3040` |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
| [forge-layout-workspace-scope.md](./plans/forge-layout-workspace-scope.md) | **Next implement** — per-ws desks |
| [forge-tab-chrome-drag.md](./plans/forge-tab-chrome-drag.md) | Deferred browser-tab DnD |
| [forge-action-pipeline.md](./plans/forge-action-pipeline.md) | Code complete |
| [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md) | Done |
| [forge-first-class-containers](./plans/forge-first-class-containers.md) | Selection mid-wave unmerged |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [layout workspace scope](./plans/forge-layout-workspace-scope.md) | **Next** WS0–WS3 ready |
| **P0** | [layout live X11](./plans/forge-layout-live-x11.md) | Complete LX1–LX4 (live tab DnD gap → TD plan) |
| **P0** | [action pipeline](./plans/forge-action-pipeline.md) | Code complete (AP0–AP4; AP5 agent) |
| **P1** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft — human gesture matrix |
| P1 | [layout control loop](./plans/forge-layout-control-loop.md) | Merged — residual operator smoke |
| **done** | [monitor-recovery rename](./plans/forge-monitor-recovery-rename.md) | Merged master |
| **done** | [layout mon order reverse X11](./tasks/completed/forge-layout-mon-order-x11-reversed.md) | Bare L→R bind |
| **P1** | Wayland residual smoke | Operator Wayland session |
| **P1** | Container selection S3+ | Unmerged containers branch; rebase first |
| **P1** | Desktop keybinds KB1–4 | After S3 |
| **P2** | [tab chrome drag](./plans/forge-tab-chrome-drag.md) | Deferred until core dual-session + WS scope |
| P1 | [stacked](./plans/forge-stacked-layouts.md) | SL0–SL5 done; SL6 optional |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Optional/parked |

### Done recently

| Item | Note |
| --- | --- |
| mon-order X11 | Bare dual → physical L→R — `0e8c2f7` |
| monitor-recovery rename | soft-rehome → monitor-recovery — `ed77e04` |
| Queue workspace-scope + tab-drag plans | 2026-08-06 design lock |
