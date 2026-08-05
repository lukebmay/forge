# forge (lukebmay) — active priorities

**Updated:** 2026-08-05 (layout control-loop plan locked; Ghostty open desync)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Layout control loop (CL0–CL4)** | Open=batch N; settle+verify; Ghostty sole-open desync; X11+Wayland |
| **2** | **Border / Wayland smoke residual** | Finish wayland-live gate if still dirty |
| **3** | **Container selection finish** | S3 kit binds → S5 live QA |
| **4** | **Desktop keybinds** | Manage GNOME chords; Safe dual-lock |

**Rename soft-rehome → monitor-recovery:** separate small PR — do not block CL.

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **CL0** | `requestLayout` / `requestVerify` debounce skeleton | [task](./tasks/forge-layout-control-loop_cl0-request-api.md) |
| **2** | **CL1–CL4** | Verify ×2, catalog, open=batch N=1, Ghostty live | [plan](./plans/forge-layout-control-loop.md) |
| **3** | **MR0** | monitor-recovery rename (own branch/PR) | [plan](./plans/forge-monitor-recovery-rename.md) |
| **4** | **CON S3** | After reliability green enough | [container-selection](./plans/forge-container-selection.md) |

**Shipped recently**

| Item | Note |
| --- | --- |
| Wayland W1–W5 + W-storm | sizes, PlaceNext, Guake, render-storm guards |
| Soft-rehome (H1) lock+DPMS | **Ours** (not jcrussell); product name → monitor-recovery later |
| Selection S1–S2 | Elevated ops + bag chrome |
| **KB0** kit-aware GNOME lock | Safe Super+L+Delete |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session |
| [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md) | **Active** open/settle/verify plan |
| [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md) | Rename PR only |
| [forge-layout-settle-pure.md](./plans/forge-layout-settle-pure.md) | Superseded (lessons kept) |
| [forge-wayland-live.md](./plans/forge-wayland-live.md) | W4 thrash residual |
| [forge-container-selection.md](./plans/forge-container-selection.md) | S3 next product |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [layout control loop](./plans/forge-layout-control-loop.md) | **Next** — CL0 ready |
| **P0** | Wayland border/W4 residual | Smoke if disk dirty |
| **P1** | [container selection](./plans/forge-container-selection.md) | S2 done — S3 after CL progress |
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
| Lock thrash soft-rehome | X11 GNOME ScreenSaver.Lock + panels Off → no thrash |
| Lock ownership | GNOME media-keys; no Forge DPMS |
| Selection S1–S2 | Elevated CON ops |
| LF1–LF8 layout reliability | Live OK |
| STACKED SL0–SL5 | Done |
| workon → layout rename | no BC |
