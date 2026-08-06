# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (mon-order X11 + monitor-recovery rename on master)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed (content **applied** to control-loop). Drop only after human OK — see [HANDOFF.md](./HANDOFF.md).

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **AP5 op visual** (soft) | Gesture matrix eyes-on — [blocker](./blockers/B-ap5-operator-visual-matrix.md) |
| **2** | **Container selection finish** | S3 kit binds → S5 live QA — plan on **`plan/forge-first-class-containers`** (rebase onto master first) |
| **3** | **Desktop keybinds** | KB1–4 after S3 — plan on containers branch history |
| **4** | **Wayland residual smoke** | After operator Wayland login — [task](./tasks/forge-wayland-live_residual-smoke.md) |

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **X11 live smoke** | Install/HUP this tip; layout dev L↔R; mon-recovery load | This session |
| **2** | **S3 kit binds** | After rebase `plan/forge-first-class-containers` ← master | Selection mid-wave |
| **done** | **mon-order X11** | Bare dual L→R bind | [completed](./tasks/completed/forge-layout-mon-order-x11-reversed.md) |
| **done** | **MR0–MR2** | soft-rehome → monitor-recovery | [plan](./plans/forge-monitor-recovery-rename.md) |

**Shipped on master (local, not pushed)**

| Item | Note |
| --- | --- |
| CL0–CL11 + action pipeline AP0–AP5 agent | control-loop + pipeline |
| **LX1–LX4** | live X11 layout bugs |
| **mon-order X11** | bare dual arrays physical L→R — `0e8c2f7` |
| **MR0–MR2** | monitor-recovery rename — `ed77e04` + residue `b9e3040` |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
| [forge-action-pipeline.md](./plans/forge-action-pipeline.md) | **Code complete** — formulas + AP0–AP5 agent |
| [docs/dev/actions.md](../docs/dev/actions.md) | Stage glossary + formulas |
| [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md) | CL0–CL11 historical / residual smoke notes |
| [forge-wayland-live_residual-smoke.md](./tasks/forge-wayland-live_residual-smoke.md) | Operator checklist |
| [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md) | **Done** (merged master) |
| [forge-first-class-containers](./plans/forge-first-class-containers.md) | Selection S3 lives on that plan branch |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [layout live X11](./plans/forge-layout-live-x11.md) | **Complete** LX1–LX4 A/B AGREE |
| **P0** | [action pipeline](./plans/forge-action-pipeline.md) | **Code complete** (AP0–AP4; AP5 agent) |
| **P1** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft — human gesture matrix |
| P1 | [layout control loop](./plans/forge-layout-control-loop.md) | **Merged to master** — residual operator smoke only |
| **done** | [monitor-recovery rename](./plans/forge-monitor-recovery-rename.md) | MR0–MR2 **merged master** |
| **done** | [layout mon order reverse X11](./tasks/completed/forge-layout-mon-order-x11-reversed.md) | Bare L→R bind; A/B AGREE |
| **P1** | Container selection S3+ | On `plan/forge-first-class-containers` — rebase master first |
| **P1** | Desktop keybinds KB1–4 | After S3 |
| P1 | [first-class containers](./plans/forge-first-class-containers.md) residual | Selection mid-wave unmerged |
| P1 | [stacked](./plans/forge-stacked-layouts.md) | SL0–SL5 **done**; SL6 optional |
| P2 | Live layout daily-drive | Bare-array sugar live on black |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Optional/parked |
| P3 | [layout-sugar](./plans/forge-layout-sugar.md) LS3/LS6 | Optional; main path **done** |

### Done recently

| Item | Note |
| --- | --- |
| mon-order X11 | Bare dual → physical L→R — `0e8c2f7` |
| monitor-recovery rename | soft-rehome → monitor-recovery — `ed77e04` |
| Intra-tab thrash | Focus-scoped deco; forge-geom borders-only — `e99f18b` |
| focus-no-reflow | No `renderTree("focus")` — `097807d` |
