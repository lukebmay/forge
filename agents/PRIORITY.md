# forge (lukebmay) — active priorities

**Updated:** 2026-08-06 (workspace scope WS0–WS3 **done**; **X11 RC green**)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**Agent git:** stash still listed (content **applied** to control-loop). Drop only after human OK — see [HANDOFF.md](./HANDOFF.md).  
**Install:** `v49-90-beta.2-202-g6e210a7` on black X11 (ACTIVE). **No push** until human asks.

---

## Stable release candidate (RC)

### Status: **X11 RC ready** — Wayland + session verify remain human

| Layer | Work | Owner | RC? | Status |
| --- | --- | --- | --- | --- |
| **Code** | CSS dual-load + deltas C0–C2 | agent | Required | **Done** |
| **Code** | Layout workspace scope WS0–WS3 | agent | Required | **Done** (merged master) |
| **Code** | Action pipeline, mon L→R, monitor-recovery | agent | Required | **Done** |
| **Unit** | `npm test` 2262 + `pytest unit/cli` 424 | agent | Required | **Green** |
| **Live X11** | Dual-ws isolation + layout apply + preflight | agent | Required | **Green** (2026-08-06) |
| **Live Wayland** | Residual smoke after logout | **human** | Required for Wayland OK | Pending logout |
| **Live session** | DPMS / blank-wake / daily path | **human** [B-manual](./blockers/B-manual-black-session-verify.md) | Daily-driver solid | Open hard |
| **Soft eyes** | AP5 gesture visual matrix | **human** [B-ap5](./blockers/B-ap5-operator-visual-matrix.md) | Soft quality | Open soft |
| **Post-RC** | Container motion + HTML prototype | design | No | Skip |
| **Post-RC** | Resize / autotile, tab DnD, S3+ | later | No | Skip |

**Operator next:** log out → GNOME Wayland → residual smoke task → optional AP5 eyes + session verify → tag/release when happy.

### X11 RC smoke (agent 2026-08-06)

| Check | Result |
| --- | --- |
| Install / ACTIVE | `v49-90-beta.2-202-g6e210a7` |
| Inkscape on ws2 vs `forge layout dev` on ws1 | **Unchanged** (`mo0ws1`) |
| Live apply | reused 7 / open 0 / move 0 |
| Preflight (missing / OOR / mix / save charset) | Exit 1; structure stable |
| Sequential / static dry-run | OK |
| Unit suites | 2262 + 424 green |

---

## Priority order (after RC code)

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Wayland residual** (operator) | [task](./tasks/forge-wayland-live_residual-smoke.md) |
| **2** | **Session verify** (human hard) | [B-manual](./blockers/B-manual-black-session-verify.md) |
| **3** | **AP5 visual** (soft) | [B-ap5](./blockers/B-ap5-operator-visual-matrix.md) |
| **post-RC** | Container motion design + MD1 | [plan](./plans/forge-container-motion-design.md) |
| **post-RC** | Resize / autotile design | P3 parked |

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **done RC** | [layout workspace scope](./plans/forge-layout-workspace-scope.md) | WS0–WS3 done X11 |
| **done RC** | [CSS base + user overrides](./plans/forge-css-overrides.md) | C0–C2 |
| **P0 human** | Wayland residual smoke | Operator logout |
| **P1 human** | [session verify](./blockers/B-manual-black-session-verify.md) | Hard |
| **soft** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft |
| **post-RC** | [container motion design](./plans/forge-container-motion-design.md) | Design |
| **done** | [action pipeline](./plans/forge-action-pipeline.md) | Code complete |
| **post-RC** | [tab chrome drag](./plans/forge-tab-chrome-drag.md) / S3+ | Deferred |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Parked design |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
| [forge-layout-workspace-scope.md](./plans/forge-layout-workspace-scope.md) | **Done** X11 RC |
