# forge (lukebmay) — active priorities

**Updated:** 2026-07-29  
**Lens:** day-to-day impact on `black` (dual 4K, X11, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **D0 settle** | Discussion: pure settle / low-jump rehome | [forge-layout-settle-pure.md](./plans/forge-layout-settle-pure.md) |
| 2 | stacks SL5 | Live verify stack↔tab / merge on black | [forge-stacked-layouts.md](./plans/forge-stacked-layouts.md) |
| 3 | resize/autotile | Discussion (human): yuiop + auto-tile | [forge-resize-and-autotile.md](./plans/forge-resize-and-autotile.md) · [blocker](./blockers/resize-autotile-design.md) |

**Shipped this session (layout sizes)**

| Item | Note |
| --- | --- |
| **SZ1–SZ3** | Custom `share` on layout sugar; save/load/apply; install track; live black |

**Shipped this session**

| Item | Note |
| --- | --- |
| **LF1** partial reopen | mon ensure scope; role_pins residual; survivor focus |
| **LF2** tab click focus | raise→focus→activate; chrome restack; hover no re-bury |
| **LF3** mon1 Ghostty reopen | PlaceNext reverse-DNS stem; residual moves before still-open fail |
| **LF4** Ghostty multi-instance open | no single-instance desktop; belt mon move |
| **SI1** install snapshot focus | sync lastTabFocus from focus before save |
| **LF5** settle before layout move | wait TILE before residual Move |
| **OP2** dock second tile | dock appId normalize + firstRender place |
| **LF6** open-then-stable-rehome | whole-tree stable before residual rehome |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [forge-layout-reliability.md](./plans/forge-layout-reliability.md) | LF1–LF6 **live OK** — keep open-then-stable-rehome |
| [forge-layout-settle-pure.md](./plans/forge-layout-settle-pure.md) | **Next design** — low-jump pure settle (D0 discussion) |
| [forge-stacked-layouts.md](./plans/forge-stacked-layouts.md) | STACKED product path |
| [forge-layout-sugar.md](./plans/forge-layout-sugar.md) | Main path **done** (LS1–2,4–5,7–8) |
| [forge-layout-sizes.md](./plans/forge-layout-sizes.md) | Custom `share` **done** (SZ1–SZ3) on `plan/forge-layout-sizes` |
| [docs/user/layout.md](../docs/user/layout.md) | Layout profiles + share sugar + survivor open-leaf |
| [forge-workon-thrash-zero.md](./plans/forge-workon-thrash-zero.md) | Historical thrash-zero |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| P1 | [layout settle pure](./plans/forge-layout-settle-pure.md) D0 | Discussion only; LF6 stays until design lock |
| P1 | [stacked](./plans/forge-stacked-layouts.md) | Phase 1 **done**; SL5 live |
| P2 | Live layout daily-drive | Bare-array sugar live on black |
| P3 | [layout-sugar](./plans/forge-layout-sugar.md) LS3/LS6 | Optional; main path **done** |

### Done recently

| Item | Note |
| --- | --- |
| LF1 + LF2 layout reliability | A/B AGREE on `plan/forge-layout-reliability` |
| layout two-pass mon claim | unit green; live closed by LF1 |
| layout list docs/tests | host-only table UX + tree-root |
| layout-sugar LS1–2,4–5,7–8 | Main path done |
| STACKED Phase 1 / SL0–SL4 | keys, save, thrash parity, regression |
| workon → layout rename | no BC |
