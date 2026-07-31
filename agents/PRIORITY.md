# forge (lukebmay) — active priorities

**Updated:** 2026-07-30  
**Lens:** day-to-day impact on `black` (dual 4K, X11, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **containers** | First-class CONs (+ resize); zoom/float later | [forge-first-class-containers.md](./plans/forge-first-class-containers.md) — **C0–C1 + R1 done**; next **C2** |
| 2 | **D0 settle** | **User lock** on pure settle hybrid (draft in plan) | [forge-layout-settle-pure.md](./plans/forge-layout-settle-pure.md) |
| 3 | resize ratio/autotile | Optional yuiop + auto-tile (not structural resize) | [forge-resize-and-autotile.md](./plans/forge-resize-and-autotile.md) · [blocker](./blockers/resize-autotile-design.md) |
| 4 | stacks SL6 | Optional polish (float residual in stack ensure) | [forge-stacked-layouts.md](./plans/forge-stacked-layouts.md) |

**Shipped this session**

| Item | Note |
| --- | --- |
| **SZ1–SZ3** | Custom `share` — **merged to master** + installed on black |
| **SL5** | STACKED live verify on black (toggle/save/rehome; Ghostty kept) |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [forge-layout-reliability.md](./plans/forge-layout-reliability.md) | LF1–LF6 **live OK** — keep open-then-stable-rehome |
| [forge-layout-settle-pure.md](./plans/forge-layout-settle-pure.md) | **D0 draft ready** — hybrid settle; needs user lock |
| [forge-stacked-layouts.md](./plans/forge-stacked-layouts.md) | STACKED **SL0–SL5 done**; SL6 optional |
| [forge-layout-sugar.md](./plans/forge-layout-sugar.md) | Main path **done** (LS1–2,4–5,7–8) |
| [forge-layout-sizes.md](./plans/forge-layout-sizes.md) | Custom `share` **done** (SZ1–SZ3) — **merged master** |
| [docs/user/layout.md](../docs/user/layout.md) | Layout profiles + share sugar + survivor open-leaf |
| [forge-workon-thrash-zero.md](./plans/forge-workon-thrash-zero.md) | Historical thrash-zero |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| P1 | [layout settle pure](./plans/forge-layout-settle-pure.md) D0 | Draft hybrid ready; **user lock** then PS1 |
| P0 | [first-class containers](./plans/forge-first-class-containers.md) | **C0–C1 + R1 done** (I1 + owning-split expand); next **C2** group/ungroup |
| P1 | [stacked](./plans/forge-stacked-layouts.md) | SL0–SL5 **done**; SL6 optional |
| P2 | Live layout daily-drive | Bare-array sugar live on black |
| P3 | [resize ratio/autotile](./plans/forge-resize-and-autotile.md) | Optional only; structural resize lives in containers plan |
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
