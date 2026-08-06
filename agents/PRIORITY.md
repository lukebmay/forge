# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (wrap — next: WS scope → Wayland RC smoke)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed (content **applied** to control-loop). Drop only after human OK — see [HANDOFF.md](./HANDOFF.md).

**RC note:** After WS0–WS3 + X11/Wayland green → reasonable **release candidate** *before* peel/container motion and tab DnD.

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Layout workspace scope** | Desks = workspaces; no cross-ws steal; sequential XOR static CLI — [plan](./plans/forge-layout-workspace-scope.md) |
| **2** | **Wayland residual + RC smoke** | Operator Wayland after WS — [task](./tasks/forge-wayland-live_residual-smoke.md) + HANDOFF checklist |
| **3** | **AP5 op visual** (soft) | Gesture matrix eyes-on — [blocker](./blockers/B-ap5-operator-visual-matrix.md) |
| **4** | **Container motion design + HTML prototype** | Peel B / join locks — [plan](./plans/forge-container-motion-design.md) — **post-RC product** |
| **5** | **Container selection S3+** | After rebase containers branch; kit binds |
| **6** | **Desktop keybinds KB1–4** | After S3 |
| **later** | **Tab chrome drag (browser-like)** | P2 — [plan](./plans/forge-tab-chrome-drag.md) |

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **WS0–WS3** | Workspace-scoped layout end-to-end | [plan](./plans/forge-layout-workspace-scope.md) |
| **2** | **Wayland RC** | Residual smoke + layout dual-ws | After WS on master |
| **post-RC** | **MD1** | HTML motion prototype | [task](./tasks/forge-container-motion-design_md1-html-prototype.md) |

**Shipped on master (local, not pushed)**

| Item | Note |
| --- | --- |
| mon-order X11 + monitor-recovery rename | `0e8c2f7` … `b9e3040` |
| Queue workspace-scope + motion design | exclusive CLI modes; peel/join discussion |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
| [forge-layout-workspace-scope.md](./plans/forge-layout-workspace-scope.md) | **P0 implement** |
| [forge-container-motion-design.md](./plans/forge-container-motion-design.md) | Design + prototype; open D1–D9 |
| [forge-tab-chrome-drag.md](./plans/forge-tab-chrome-drag.md) | Deferred browser-tab DnD |
| [forge-action-pipeline.md](./plans/forge-action-pipeline.md) | Code complete |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [layout workspace scope](./plans/forge-layout-workspace-scope.md) | **Next** WS0–WS3; sequential XOR static |
| **P1** | [container motion design](./plans/forge-container-motion-design.md) | Design open; MD1 prototype next |
| **P0** | [layout live X11](./plans/forge-layout-live-x11.md) | Complete LX1–LX4 (peel incomplete → motion plan) |
| **P0** | [action pipeline](./plans/forge-action-pipeline.md) | Code complete |
| **P1** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft |
| **done** | [monitor-recovery rename](./plans/forge-monitor-recovery-rename.md) | Merged master |
| **done** | [mon-order X11](./tasks/completed/forge-layout-mon-order-x11-reversed.md) | Bare L→R |
| **P1** | Wayland residual smoke | Operator Wayland |
| **P1** | Container selection S3+ | Unmerged branch |
| **P2** | [tab chrome drag](./plans/forge-tab-chrome-drag.md) | Deferred |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Parked |

### Done recently

| Item | Note |
| --- | --- |
| Workspace CLI: no mix sequential + numbered | Locked 2026-08-06 |
| Motion design plan + MD1 task | Peel B lean; HTML prototype required |
