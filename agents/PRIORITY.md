# forge (lukebmay) — active priorities

**Updated:** 2026-08-08 (Wayland agent RC smoke)  
**Lens:** day-to-day impact on `black` (dual 4K, Shell 46 **Wayland**), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

**No push** until human asks.  
**Active P0:** **logout to load tip** + soft eyes (AP5); cold layout Mode B residual known.

---

## Stable release candidate (RC)

### Status: **usable RC** on Wayland — cold layout needs Mode B; logout for tip

| Layer | Work | Owner | Status |
| --- | --- | --- | --- |
| **Code** | Workspace scope, theme overlay, action pipeline | agent | **Done** |
| **Code** | WR1 chrome geom / focus thrash | agent | **Done** |
| **Code** | Guake-named rehome | agent | **Reverted** (`0d18ac0`) — float only |
| **Code** | Settle learning SL1+SL2 | agent | **Done** |
| **Code** | Mon-child giant-tab peel + float-only save UX | agent | **Done** (2026-08-07) |
| **Live X11** | Dual-ws + layout + theme + apply-contract AC6 | agent | **Green** |
| **Live Wayland** | Residual re-smoke + thrash dump | agent | **2026-08-08** — Mode B green; nested-CON residual |
| **Live session** | DPMS / blank-wake | **human** B-manual | Open hard |
| **Soft eyes** | AP5 visual matrix | **human** B-ap5 | Soft |
| **Post-RC** | ignore mode, SL3 seed drop, container motion, … | later | Mid / design |

**Operator next:** **log out** (disk has chrome-through-residual + mon0 nested hoist) →
2-ghostty / cold `forge layout dev` → confirm chrome stays until place done + mon0
tab\|ghostty → eyes focus-walk (AP5) → optional DPMS → push/tag when ready.

---

## Priority order

| Order | Work | Why |
| ---: | --- | --- |
| **1** | **Logout + AP5 eyes** (human) | Load tip `5ea572b`; visual focus matrix (soft) |
| **done** | Wayland residual re-smoke (agent) | Mode B recover green; nested-CON residual known |
| **done** | AC1–AC6 apply contract | sensor verify, epoch, drop LF6 default, placeholder, slot tests, **X11 live** |
| **done** | Meta baseline black/wayland | D=0 thrash-free Forge-off; product thrash is Forge-side |
| **park** | Forge-on thrash probe | Only if instrumented to localize loops; not “prove thrash” |
| **park** | X11 + gray/green probe | After contract needs a second host |
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
| **done** | [layout apply/settle AC1–AC6](./plans/forge-layout-apply-contract.md) | X11 live green 2026-08-07 |
| **done RC** | Wayland residual re-smoke (agent) | Mode B recover; logout for tip still |
| **P0 human** | Logout + AP5 eyes after tip load | Soft matrix / visual |
| **P1 human** | [session verify](./blockers/B-manual-black-session-verify.md) | Hard |
| **soft** | [AP5 op visual](./blockers/B-ap5-operator-visual-matrix.md) | Soft |
| **mid** | [window ignore mode](./tasks/forge-window-ignore-mode.md) | ready, not RC |
| **post-RC** | [container motion](./plans/forge-container-motion-design.md) | Design |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Cross-session — **start here** |
