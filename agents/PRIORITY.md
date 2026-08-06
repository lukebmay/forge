# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (wrap-up on master; **Wayland operator next**)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed — drop only after human OK.  
**Install:** `v49-90-beta.2-205-g5a8714a` on black. **No push** until human asks.

---

## Stable release candidate (RC)

### Status: **X11 RC code ready** — operator Wayland + session verify

| Layer | Work | Owner | Status |
| --- | --- | --- | --- |
| **Code** | Workspace scope WS0–WS3 | agent | **Done** on master |
| **Code** | CSS effective overlay (user colors) | agent | **Done** `5a8714a` |
| **Code** | Action pipeline, mon L→R, monitor-recovery | agent | **Done** |
| **Live X11** | Dual-ws + layout + theme | agent | **Green** |
| **Live Wayland** | Residual smoke after logout | **human** | **Next** |
| **Live session** | DPMS / blank-wake | **human** B-manual | Open hard |
| **Soft eyes** | AP5 visual matrix | **human** B-ap5 | Soft |
| **Post-RC** | Container motion, resize, tab DnD, S3+ | later | Skip |

**Operator next:** log out → Wayland → residual smoke → optional session/AP5 → push/tag when ready.

---

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Wayland residual** (operator) | [task](./tasks/forge-wayland-live_residual-smoke.md) |
| **2** | **Session verify** (human hard) | [B-manual](./blockers/B-manual-black-session-verify.md) |
| **3** | **AP5 visual** (soft) | [B-ap5](./blockers/B-ap5-operator-visual-matrix.md) |
| **post-RC** | Container motion design + MD1 | [plan](./plans/forge-container-motion-design.md) |

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **done RC** | [layout workspace scope](./plans/forge-layout-workspace-scope.md) | WS0–WS3 done |
| **done RC** | Theme effective overlay | User colors survive install |
| **done RC** | [CSS base + user overrides](./plans/forge-css-overrides.md) | C0–C2 + effective fix |
| **P0 human** | Wayland residual smoke | Operator logout |
| **P1 human** | [session verify](./blockers/B-manual-black-session-verify.md) | Hard |
| **soft** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft |
| **post-RC** | [container motion](./plans/forge-container-motion-design.md) | Design |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
