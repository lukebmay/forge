# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (Wayland operator residuals WR1+WR2 merged master)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed — drop only after human OK.  
**Install:** reinstall after this session for WR1/WR2; Wayland needs **logout** to load. **No push** until human asks.

---

## Stable release candidate (RC)

### Status: **code + WR1/WR2 fixes on master** — operator re-smoke on Wayland

| Layer | Work | Owner | Status |
| --- | --- | --- | --- |
| **Code** | Workspace scope, theme overlay, action pipeline | agent | **Done** |
| **Code** | WR1 chrome geom / focus thrash | agent | **Done** (`dd7e6ca`) |
| **Code** | WR2 Guake focus/LFT monitor | agent | **Done** (`1f44c0b`) |
| **Live X11** | Dual-ws + layout + theme | agent | **Green** |
| **Live Wayland** | Residual smoke (incl. Guake mon + Grok geom) | **human** | **Next** after install+logout |
| **Live session** | DPMS / blank-wake | **human** B-manual | Open hard |
| **Soft eyes** | AP5 visual matrix | **human** B-ap5 | Soft |
| **Post-RC** | Container motion, resize, tab DnD, S3+ | later | Skip |

**Operator next:** install (if not done) → logout → Wayland → residual smoke + Guake F12 mon0/mon1 → optional session/AP5 → push/tag when ready.

---

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Wayland residual re-smoke** (operator) | [task](./tasks/forge-wayland-live_residual-smoke.md) + [WR plan](./plans/forge-wayland-operator-residuals.md) |
| **2** | **Session verify** (human hard) | [B-manual](./blockers/B-manual-black-session-verify.md) |
| **3** | **AP5 visual** (soft) | [B-ap5](./blockers/B-ap5-operator-visual-matrix.md) |
| **post-RC** | Container motion design + MD1 | [plan](./plans/forge-container-motion-design.md) |

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **done** | [Wayland operator residuals WR1+WR2](./plans/forge-wayland-operator-residuals.md) | Merged master |
| **done RC** | [layout workspace scope](./plans/forge-layout-workspace-scope.md) | WS0–WS3 done |
| **done RC** | Theme effective overlay | User colors survive install |
| **done RC** | [CSS base + user overrides](./plans/forge-css-overrides.md) | C0–C2 + effective fix |
| **P0 human** | Wayland residual re-smoke | Operator after logout |
| **P1 human** | [session verify](./blockers/B-manual-black-session-verify.md) | Hard |
| **soft** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft |
| **post-RC** | [container motion](./plans/forge-container-motion-design.md) | Design |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
