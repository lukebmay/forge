# forge (lukebmay) — active priorities

**Updated:** 2026-08-05 (CL0–CL6 control-loop code complete; CL7 operator)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** unfinished `plan/forge-wayland-live` work is **stashed** (rival-tilers / soft-rehome / install scripts). Human is not managing it — see [HANDOFF.md](./HANDOFF.md) § *Agent git: stashed Wayland WIP*. Do not drop; do not pop onto control-loop.

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **CL7 live Ghostty / layout smoke** | Plan acceptance gate for control-loop |
| **2** | **Merge control-loop → master** | Queue + product path after CL7 (or when human says) |
| **3** | **Border / Wayland residual** | wayland-live stash + smoke |
| **4** | **Container selection finish** | S3 kit binds → S5 live QA |
| **5** | **Desktop keybinds** | Manage GNOME chords; Safe dual-lock |

**Rename soft-rehome → monitor-recovery:** separate small PR — do not block CL7.

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **CL7** | Operator: sole Ghostty + `forge layout dev` | [task](./tasks/forge-layout-control-loop_cl7-live-ghostty.md) |
| **2** | **Merge** | `plan/forge-layout-control-loop` → master when smoke OK | local only unless push asked |
| **3** | **MR0** | monitor-recovery rename (own branch/PR) | [plan](./plans/forge-monitor-recovery-rename.md) |
| **4** | **CON S3** | After reliability green enough | [container-selection](./plans/forge-container-selection.md) |

**Shipped this session (plan branch, not pushed)**

| Item | Note |
| --- | --- |
| CL0–CL6 layout control loop | debounce, verify×2, suppress, thrash catalog, open quiet, LayoutBatch, periodic gsetting |
| Unit tests | ~2095 green |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session |
| [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md) | **Active** — CL7 operator left |
| [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md) | Rename PR only |
| [forge-wayland-live.md](./plans/forge-wayland-live.md) | W4 thrash residual (stashed WIP) |
| [forge-container-selection.md](./plans/forge-container-selection.md) | S3 next product |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [layout control loop](./plans/forge-layout-control-loop.md) | **CL0–CL6 done** — CL7 operator |
| **P0** | Wayland border/W4 residual | Smoke if disk dirty; stash holds WIP |
| **P1** | [container selection](./plans/forge-container-selection.md) | S2 done — S3 after CL smoke |
| **P1** | [desktop keybinds](./plans/forge-desktop-keybinds.md) | KB0 done — KB1–4 after S3 |
| **P2** | [monitor-recovery rename](./plans/forge-monitor-recovery-rename.md) | Separate PR |
| P1 | [first-class containers](./plans/forge-first-class-containers.md) residual | After selection |
| P1 | [stacked](./plans/forge-stacked-layouts.md) | SL0–SL5 **done**; SL6 optional |
| P2 | Live layout daily-drive | Bare-array sugar live on black |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Optional/parked |
| P3 | [layout-sugar](./plans/forge-layout-sugar.md) LS3/LS6 | Optional; main path **done** |

### Done recently

| Item | Note |
| --- | --- |
| Layout control loop CL0–CL6 | request/verify/open/batch/catalog |
| Lock thrash soft-rehome | X11 GNOME ScreenSaver.Lock + panels Off → no thrash |
| Selection S1–S2 | Elevated CON ops |
| LF1–LF8 layout reliability | Live OK |
| STACKED SL0–SL5 | Done |
| workon → layout rename | no BC |
