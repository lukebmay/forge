# forge (lukebmay) — active priorities

**Updated:** 2026-08-05 (CL8 done; CL9 next; Wayland after CL8–CL10)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** unfinished `plan/forge-wayland-live` work is **stashed** (rival-tilers / soft-rehome / install scripts). Human is not managing it — see [HANDOFF.md](./HANDOFF.md) § *Agent git: stashed Wayland WIP*. Do not drop; do not pop onto master.

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **CL9–CL10** (CL8 done) deferred hidden open finish | Parallel CLI + chrome; kill sliver/jump |
| **2** | **X11 retest** then **Wayland residual** | After CL8–CL10 |
| **3** | **Container selection finish** | S3 kit binds → S5 live QA |
| **4** | **Desktop keybinds** | Manage GNOME chords; Safe dual-lock |
| **5** | **MR0 rename** | soft-rehome → monitor-recovery (own PR) |

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **CL9** | Parallel CLI open + wait-for-map + unhide gate | plan queue after CL8 |
| **2** | **CL10** | Optional apply chrome/scrim (never stick) | plan queue |
| **3** | **Live** | X11 layout dev retest → Wayland residual | [HANDOFF](./HANDOFF.md) |
| **4** | **CON S3** | After reliability green enough | [container-selection](./plans/forge-container-selection.md) |

**Shipped on master (local, not pushed)**

| Item | Note |
| --- | --- |
| CL0–CL6 layout control loop | debounce, verify×2, suppress, thrash catalog, open quiet, LayoutBatch, periodic gsetting |
| CL7 PWA open/wait (`fe8448c`) | merge desktop hints; chrome family class_eq; continue opens after fail |
| **CL7 live X11** | operator green: layout dev dual-mon tree; 150% scale |
| Merge | `plan/forge-layout-control-loop` → `master` (fast-forward) |
| Unit tests | vitest 2100; CLI pytest 358 |
| Debug install | pre-Wayland logout install done |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
| [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md) | X11 done; code on master |
| [forge-wayland-live.md](./plans/forge-wayland-live.md) | **Next residual** (stashed WIP) |
| [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md) | Rename PR only |
| [forge-container-selection.md](./plans/forge-container-selection.md) | S3 next product |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [layout control loop](./plans/forge-layout-control-loop.md) | **On master** — X11 CL7 green; Wayland residual open |
| **P0** | Wayland residual | **Next** — logout smoke; stash holds extra WIP |
| **P1** | [container selection](./plans/forge-container-selection.md) | S2 done — S3 after Wayland residual |
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
| Control-loop → master | Local fast-forward merge |
| CL7 live X11 | Operator green dual-mon layout dev |
| CL7 PWA open/wait | Grok 15s timeout fixed |
| Layout control loop CL0–CL6 | request/verify/open/batch/catalog |
| Lock thrash soft-rehome | X11 GNOME ScreenSaver.Lock + panels Off → no thrash |
| Selection S1–S2 | Elevated CON ops |
| LF1–LF8 layout reliability | Live OK |
| STACKED SL0–SL5 | Done |
| workon → layout rename | no BC |
