# forge (lukebmay) — active priorities

**Updated:** 2026-08-07 (meta-probe reshape + multi-op thrash sweeps)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**No push** until human asks.  
**Active P0:** Meta probe **harness update → multi-op delay sweeps → ghostty 5× pilot** — [`tests/meta-probe/SESSION_HANDOFF.md`](../tests/meta-probe/SESSION_HANDOFF.md).

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
| **1** | **Meta probe harness + thrash-delay maneuvers** | Core apps (nautilus, ghostty, inkscape, grok, obs); 5×; sleep inhibit; 2-step delay sweeps then **isolated 3-step** (lock one D, thrash-search the other); ghostty pilot first — [SESSION_HANDOFF](../tests/meta-probe/SESSION_HANDOFF.md) |
| **2** | **Core-app matrix** after ghostty green | Same five apps; re-run all if harness moved a lot |
| **3** | **X11 + gray/green** probe | Re-bootstrap knobs per host×session |
| **4** | **Layout engine rewrite from data** | Especially thrash-free inter-op delays |
| **mid** | Wayland product residuals (VSPLIT, Grok leaf, WS overlay, float save) | Parked until probe informs approach |
| **mid** | Session verify / AP5 | Human blockers when back to daily driver |
| **post** | Container motion, ignore mode, SL3 seeds | After measurement campaign |

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
