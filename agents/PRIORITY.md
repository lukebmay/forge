# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (open-under-focus + focus-border slot; MR rename queued)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed (content **applied** to control-loop). Drop only after human OK — see [HANDOFF.md](./HANDOFF.md).

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Wayland re-smoke** (open place + focus border) | After install/logout: Nautilus under LFT; cyan ring matches tile |
| **2** | Merge plan branch → master (when safe) | CL8–CL11 + polish + preflight + residual + open/border fixes |
| **3** | **MR0 rename: soft-rehome → monitor-recovery** | Product language; separate PR — [plan](./plans/forge-monitor-recovery-rename.md) |
| **4** | **Container selection finish** | S3 kit binds → S5 live QA |
| **5** | **Desktop keybinds** | Manage GNOME chords; Safe dual-lock |

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **Wayland** | Confirm focus-no-reflow + residual smoke after reload | [focus-no-reflow](./plans/forge-layout-control-loop/completed/forge-layout-control-loop_focus-no-reflow.md) |
| **2** | **MR0** | Rename soft-rehome → monitor-recovery (own branch/PR) | [monitor-recovery-rename](./plans/forge-monitor-recovery-rename.md) |
| **3** | **Merge** | Integrate plan → master after re-smoke | CL8–CL11 + open/border |
| **4** | **CON S3** | After reliability green enough | [container-selection](./plans/forge-container-selection.md) |

**Shipped on master (local, not pushed)**

| Item | Note |
| --- | --- |
| CL0–CL7 layout control loop | debounce, verify×2, suppress, thrash catalog, open quiet, LayoutBatch, periodic gsetting |
| CL7 PWA open/wait (`fe8448c`) | merge desktop hints; chrome family class_eq; continue opens after fail |
| **CL7 live X11** | operator green: layout dev dual-mon tree; 150% scale |
| Merge | `plan/forge-layout-control-loop` → `master` (fast-forward) |
| Unit tests | vitest 2160 (after preflight); CLI pytest 365 |

**On plan branch (not yet on master)**

| Item | Note |
| --- | --- |
| CL8–CL9 | deferred hidden open + parallel map wait + release-deferred |
| CL10 | apply chrome default on; spinner + layout name; hard ≤8s clear |
| CL11 | residual mon-ensure + structure verifier |
| X11 polish | ghost deco after auto-exit (`9beebdc`); chrome UI (`20c8d8f`) |
| **Wayland preflight** | SEGV-safe `safeMoveToMonitor`; move dest mon + ε; rival tilers; installed dirty |
| **Wayland residual fixes** | PWA tab icons; launch cwd=$HOME; focus attach; nearest-edge DnD; preview never-stick |
| **Lock/sleep thrash** | Lock forest shield; no settle while locked; 8s unlock shield + 900ms settle |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
| [forge-layout-control-loop.md](./plans/forge-layout-control-loop.md) | CL8–CL11 + X11 polish |
| [forge-wayland-live_residual-smoke.md](./tasks/forge-wayland-live_residual-smoke.md) | **Operator next** |
| [forge-monitor-recovery-rename.md](./plans/forge-monitor-recovery-rename.md) | Rename PR only |
| [forge-container-selection.md](./plans/forge-container-selection.md) | S3 next product |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [layout control loop](./plans/forge-layout-control-loop.md) | CL8–CL11 + open/border fixes on plan branch |
| **P0** | Wayland re-smoke | Install done; **logout** to load; check open place + focus border |
| **P1** | [monitor-recovery rename](./plans/forge-monitor-recovery-rename.md) | **MR0 next** — soft-rehome → monitor-recovery (own PR) |
| **P1** | [container selection](./plans/forge-container-selection.md) | S2 done — S3 after Wayland residual |
| **P1** | [desktop keybinds](./plans/forge-desktop-keybinds.md) | KB0 done — KB1–4 after S3 |
| P1 | [first-class containers](./plans/forge-first-class-containers.md) residual | After selection |
| P1 | [stacked](./plans/forge-stacked-layouts.md) | SL0–SL5 **done**; SL6 optional |
| P2 | Live layout daily-drive | Bare-array sugar live on black |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Optional/parked |
| P3 | [layout-sugar](./plans/forge-layout-sugar.md) LS3/LS6 | Optional; main path **done** |

### Done recently

| Item | Note |
| --- | --- |
| Wayland preflight | SEGV gates + move dest mon + rival tilers (control-loop) |
| CL10 apply chrome | Opt-in dim + hard ≤8s clear (plan branch) |
| Control-loop → master | Local fast-forward merge (CL0–CL7) |
| CL7 live X11 | Operator green dual-mon layout dev |
| CL7 PWA open/wait | Grok 15s timeout fixed |
| Layout control loop CL0–CL6 | request/verify/open/batch/catalog |
| Lock thrash soft-rehome | X11 GNOME ScreenSaver.Lock + panels Off → no thrash |
| Selection S1–S2 | Elevated CON ops |
| LF1–LF8 layout reliability | Live OK |
| STACKED SL0–SL5 | Done |
| workon → layout rename | no BC |
