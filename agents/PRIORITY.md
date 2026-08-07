# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (Guake rehome reverted; ignore + settle-learning queued mid)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed — drop only after human OK.  
**Install:** tip includes WR1 + Guake rehome **revert** (`0d18ac0`); Wayland needs **logout**. **No push** until human asks.

---

## Stable release candidate (RC)

### Status: **code ready** — operator Wayland re-smoke (float OK for Guake; no app rehome)

| Layer | Work | Owner | Status |
| --- | --- | --- | --- |
| **Code** | Workspace scope, theme overlay, action pipeline | agent | **Done** |
| **Code** | WR1 chrome geom / focus thrash | agent | **Done** |
| **Code** | Guake-named rehome | agent | **Reverted** (`0d18ac0`) — float only |
| **Live X11** | Dual-ws + layout + theme | agent | **Green** |
| **Live Wayland** | Residual smoke (geom, tabs, Guake float) | **human** | **Next** after install+logout |
| **Live session** | DPMS / blank-wake | **human** B-manual | Open hard |
| **Soft eyes** | AP5 visual matrix | **human** B-ap5 | Soft |
| **Post-RC** | ignore mode, settle learning, container motion, … | later | Mid / design |

**Operator next:** install → logout → Wayland residual smoke → optional session/AP5 → push/tag when ready.

---

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Wayland residual re-smoke** (operator) | [task](./tasks/forge-wayland-live_residual-smoke.md) |
| **2** | **Session verify** (human hard) | [B-manual](./blockers/B-manual-black-session-verify.md) |
| **3** | **AP5 visual** (soft) | [B-ap5](./blockers/B-ap5-operator-visual-matrix.md) |
| **mid** | **Window ignore mode** | [task](./tasks/forge-window-ignore-mode.md) — not RC |
| **mid draft** | **Settle learning** (drop thrash seeds) | [task](./tasks/forge-settle-learning.md) — after smoke |
| **post-RC** | Container motion design + MD1 | [plan](./plans/forge-container-motion-design.md) |

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **done** | WR1 chrome geom; Guake rehome reverted | master |
| **done RC** | [layout workspace scope](./plans/forge-layout-workspace-scope.md) | WS0–WS3 done |
| **done RC** | Theme effective overlay | User colors survive install |
| **done RC** | [CSS base + user overrides](./plans/forge-css-overrides.md) | C0–C2 + effective fix |
| **P0 human** | Wayland residual re-smoke | Operator after logout |
| **P1 human** | [session verify](./blockers/B-manual-black-session-verify.md) | Hard |
| **soft** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft |
| **mid** | [window ignore mode](./tasks/forge-window-ignore-mode.md) | ready, not RC |
| **mid draft** | [settle learning](./tasks/forge-settle-learning.md) | after reload evidence |
| **post-RC** | [container motion](./plans/forge-container-motion-design.md) | Design |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
