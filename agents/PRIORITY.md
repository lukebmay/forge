# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (RC path: WS0–WS3 + X11 smoke; Wayland operator)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed (content **applied** to control-loop). Drop only after human OK — see [HANDOFF.md](./HANDOFF.md).

---

## Stable release candidate (RC) — clear gates

**Goal:** shippable daily-driver RC on X11; operator confirms Wayland after logout.

| Layer | Work | Owner | RC? |
| --- | --- | --- | --- |
| **Code P0** | Layout workspace scope WS0–WS3 | agent (this session) | **Required** |
| **Code done** | CSS dual-load + deltas C0–C2 | shipped | **Required** (done) |
| **Code done** | Action pipeline AP0–AP5 agent path | shipped | **Required** (done) |
| **Code done** | mon L→R bare bind + monitor-recovery rename | shipped | **Required** (done) |
| **Live X11** | Dual-ws isolation + `forge layout dev` smoke | agent after WS | **Required** |
| **Live Wayland** | Residual smoke after logout | **human** | **Required before “Wayland OK”** |
| **Live session** | DPMS / blank-wake / daily layout | **human** [B-manual](./blockers/B-manual-black-session-verify.md) | **Required for daily-driver solid** |
| **Soft eyes** | AP5 gesture visual matrix | **human** [B-ap5](./blockers/B-ap5-operator-visual-matrix.md) | Soft quality |
| **Post-RC** | Container motion design + HTML prototype | design — skip for RC | No |
| **Post-RC** | Container selection S3+, tab chrome drag | later | No |
| **Post-RC** | Resize / autotile | design blocker P3 | No |

**RC ready when:** WS0–WS3 + unit green + X11 dual-ws smoke green; docs/help match locks.  
**Release after:** operator Wayland residual + optional AP5 eyes + session verify (or accepted risk).

---

## Priority order (agent queue)

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Layout workspace scope WS0–WS3** | Desks = workspaces; no cross-ws steal — [plan](./plans/forge-layout-workspace-scope.md) |
| **2** | **X11 RC smoke** | Dual-ws + layout dev after WS |
| **3** | **Wayland residual** (operator) | After logout — [task](./tasks/forge-wayland-live_residual-smoke.md) |
| **done** | **CSS base + user overrides** | C0–C2 shipped |
| **skip RC** | Container motion design | Post-RC product |
| **skip RC** | Resize/autotile design | P3 parked |
| **soft** | AP5 op visual | Human soft |

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **WS0–WS3** | Workspace-scoped layout end-to-end | [plan](./plans/forge-layout-workspace-scope.md) |
| **2** | **X11 RC** | Live dual-ws + layout after WS | WS3 + install |
| **3** | **Wayland RC** | Operator after logout | [task](./tasks/forge-wayland-live_residual-smoke.md) |

**Shipped on master (local, not pushed)**

| Item | Note |
| --- | --- |
| mon-order X11 + monitor-recovery rename | `0e8c2f7` … `b9e3040` |
| CSS dual-load + delta overrides | `0669830` … `d57b528` |
| Queue workspace-scope + motion design | exclusive CLI modes; peel/join post-RC |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
| [forge-layout-workspace-scope.md](./plans/forge-layout-workspace-scope.md) | **P0 RC** |
| [forge-css-overrides.md](./plans/forge-css-overrides.md) | Done C0–C2 |
| [forge-container-motion-design.md](./plans/forge-container-motion-design.md) | Post-RC design |
| [forge-action-pipeline.md](./plans/forge-action-pipeline.md) | Code complete |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0 RC** | [layout workspace scope](./plans/forge-layout-workspace-scope.md) | **In progress** WS0–WS3 |
| **done** | [CSS base + user overrides](./plans/forge-css-overrides.md) | C0–C2 |
| **P1 RC** | X11 dual-ws + layout smoke | After WS3 |
| **P1 RC** | Wayland residual smoke | Operator logout |
| **P1 RC** | [session verify](./blockers/B-manual-black-session-verify.md) | Human hard |
| **soft** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft |
| **post-RC** | [container motion design](./plans/forge-container-motion-design.md) | Design open |
| **done** | [action pipeline](./plans/forge-action-pipeline.md) | Code complete |
| **done** | [monitor-recovery rename](./plans/forge-monitor-recovery-rename.md) | Merged master |
| **done** | [mon-order X11](./tasks/completed/forge-layout-mon-order-x11-reversed.md) | Bare L→R |
| **post-RC** | Container selection S3+ | Unmerged branch |
| **post-RC** | [tab chrome drag](./plans/forge-tab-chrome-drag.md) | Deferred |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Parked design |

### Done recently

| Item | Note |
| --- | --- |
| CSS dual-load + delta overrides (D001) | C0–C2; personal colors no longer clobbered |
| Operator purple theme restored under `~/.config/forge` | Survives dual-load |
| Workspace CLI: no mix sequential + numbered | Locked 2026-08-06 |
| Motion design plan + MD1 task | Peel Model B lean; **post-RC** |
