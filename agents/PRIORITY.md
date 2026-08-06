# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (AP2 done; AP3 next; X11 mon-order filed)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed (content **applied** to control-loop). Drop only after human OK — see [HANDOFF.md](./HANDOFF.md).

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Action pipeline** (AP1 `afterFocus` → AP2 one-commit) | Consistent formulas; kill duplicate chrome/render paths — [plan](./plans/forge-action-pipeline.md) |
| **2** | **X11 HUP smoke** of merged Wayland/control-loop + pipeline as it lands | Agent can HUP on X11; dual-mon thrash + focus |
| **3** | **MR0 rename: soft-rehome → monitor-recovery** | Product language; separate PR — [plan](./plans/forge-monitor-recovery-rename.md) |
| **4** | **Container selection finish** | S3 kit binds → S5 live QA |
| **5** | **Desktop keybinds** | Manage GNOME chords; Safe dual-lock |
| **6** | **layout mon order reverse (X11)** | `forge layout dev` flipped mon L/R — [task](./tasks/forge-layout-mon-order-x11-reversed.md) |

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **AP3** | Geom/open/RunSteps formula alignment | [action-pipeline](./plans/forge-action-pipeline.md) |
| **2** | **AP4** | command.js → commitLayout facade | same plan |
| **3** | **MR0** | Rename soft-rehome → monitor-recovery (own branch/PR) | [monitor-recovery-rename](./plans/forge-monitor-recovery-rename.md) |
| **4** | **CON S3** | After pipeline reliability green enough | [container-selection](./plans/forge-container-selection.md) |
| later | **mon-order X11** | Reversed monitor order on `forge layout dev` | [task](./tasks/forge-layout-mon-order-x11-reversed.md) |

**Shipped on master (local, not pushed)**

| Item | Note |
| --- | --- |
| CL0–CL7 layout control loop | debounce, verify×2, suppress, thrash catalog, open quiet, LayoutBatch |
| CL7 live X11 | operator green layout dev dual-mon |
| **CL8–CL11 + Wayland residual** | deferred open, apply chrome, mon-ensure, SEGV-safe move, lock shield, open/border, intra-tab thrash |
| Merge | `plan/forge-layout-control-loop` → `master` @ `e99f18b` (FF) |
| **AP0** | action pipeline plan + `docs/dev/actions.md` |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
| [forge-action-pipeline.md](./plans/forge-action-pipeline.md) | **P0 active** — formulas + AP1–AP5 |
| [docs/dev/actions.md](../docs/dev/actions.md) | Stage glossary + formulas |
| [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md) | CL0–CL11 historical / residual smoke notes |
| [forge-wayland-live_residual-smoke.md](./tasks/forge-wayland-live_residual-smoke.md) | Operator checklist |
| [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md) | Rename PR only |
| [forge-container-selection.md](./plans/forge-container-selection.md) | S3 next product |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [action pipeline](./plans/forge-action-pipeline.md) | **AP2 done; AP3 next** |
| **P0** | X11 HUP smoke (merged control-loop + pipeline) | Operator on X11; agent HUP |
| P1 | [layout control loop](./plans/forge-layout-control-loop.md) | **Merged to master** — residual operator smoke only |
| **P1** | [monitor-recovery rename](./plans/forge-monitor-recovery-rename.md) | MR0 — own PR |
| **P1** | [container selection](./plans/forge-container-selection.md) | S2 done — S3 after pipeline green |
| **P1** | [desktop keybinds](./plans/forge-desktop-keybinds.md) | KB0 done — KB1–4 after S3 |
| **P1** | [layout mon order reverse X11](./tasks/forge-layout-mon-order-x11-reversed.md) | Filed 2026-08-06; after pipeline |
| P1 | [first-class containers](./plans/forge-first-class-containers.md) residual | After selection |
| P1 | [stacked](./plans/forge-stacked-layouts.md) | SL0–SL5 **done**; SL6 optional |
| P2 | Live layout daily-drive | Bare-array sugar live on black |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Optional/parked |
| P3 | [layout-sugar](./plans/forge-layout-sugar.md) LS3/LS6 | Optional; main path **done** |

### Done recently

| Item | Note |
| --- | --- |
| Intra-tab thrash | Focus-scoped deco; forge-geom borders-only — `e99f18b` |
| focus-no-reflow | No `renderTree("focus")` — `097807d` |
| Control-loop → master | FF merge 2026-08-06 |
