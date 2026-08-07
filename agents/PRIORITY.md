# forge (lukebmay) — active priorities

**Updated:** 2026-08-07 (mon-child topology peel on master; Wayland re-smoke next)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed — drop only after human OK.  
**Install:** master tip includes mon-child peel + settle SL1+SL2; Wayland needs **logout**. **No push** until human asks.  
**Active:** [settle-learning](./plans/forge-settle-learning.md) SL3 needs live samples; topology peel shipped.

---

## Stable release candidate (RC)

### Status: **code ready** — operator Wayland re-smoke after install+logout

| Layer | Work | Owner | Status |
| --- | --- | --- | --- |
| **Code** | Workspace scope, theme overlay, action pipeline | agent | **Done** |
| **Code** | WR1 chrome geom / focus thrash | agent | **Done** |
| **Code** | Guake-named rehome | agent | **Reverted** (`0d18ac0`) — float only |
| **Code** | Settle learning SL1+SL2 | agent | **Done** |
| **Code** | Mon-child giant-tab peel + float-only save UX | agent | **Done** (2026-08-07) |
| **Live X11** | Dual-ws + layout + theme | agent | **Green** |
| **Live Wayland** | Residual re-smoke + thrash dump | **human** | **Next** after install+logout |
| **Live session** | DPMS / blank-wake | **human** B-manual | Open hard |
| **Soft eyes** | AP5 visual matrix | **human** B-ap5 | Soft |
| **Post-RC** | ignore mode, SL3 seed drop, container motion, … | later | Mid / design |

**Operator next:** install → logout → `forge layout dev` (expect mon0 tab\|ghostty + Grok active) → ghostty-only re-layout → `forge thrash` → optional session/AP5 → push/tag when ready.

---

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Wayland re-smoke + thrash dump** (operator) | Confirm peel fixes giant-tab / Grok leaf; [smoke](./tasks/forge-wayland-live_residual-smoke.md) |
| **2** | **Session verify** (human hard) | [B-manual](./blockers/B-manual-black-session-verify.md) |
| **3** | **AP5 visual** (soft) | [B-ap5](./blockers/B-ap5-operator-visual-matrix.md) |
| **mid** | **Window ignore mode** | [task](./tasks/forge-window-ignore-mode.md) — not RC |
| **mid** | **Settle SL3** (drop seeds) | after operator thrash evidence (`settleSampleCount` > 0) |
| **post-RC** | Container motion design + MD1 | [plan](./plans/forge-container-motion-design.md) |

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **done** | WR1 chrome geom; Guake rehome reverted | master |
| **done RC** | [layout workspace scope](./plans/forge-layout-workspace-scope.md) | WS0–WS3 done |
| **done RC** | Theme effective overlay | User colors survive install |
| **done RC** | [CSS base + user overrides](./plans/forge-css-overrides.md) | C0–C2 + effective fix |
| **done mid** | [settle-learning SL1+SL2](./plans/forge-settle-learning.md) | samples + `forge thrash` |
| **done** | [mon-child topology peel](./tasks/completed/forge-layout-mon-child-topology.md) | giant-tab + float save UX |
| **P0 human** | Wayland residual re-smoke + thrash | Operator after logout |
| **P1 human** | [session verify](./blockers/B-manual-black-session-verify.md) | Hard |
| **soft** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft |
| **mid** | [window ignore mode](./tasks/forge-window-ignore-mode.md) | ready, not RC |
| **post-RC** | [container motion](./plans/forge-container-motion-design.md) | Design |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
