# forge (lukebmay) — active priorities

**Updated:** 2026-07-29  
**Lens:** day-to-day impact on `black` (dual 4K, X11, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

## Next session focus

| Order | ID | Task | Why |
| ---: | --- | --- | --- |
| **1** | **LF2** | Tab click sometimes needs dock prime before focus works | [forge-layout-reliability.md](./plans/forge-layout-reliability.md) |
| 2 | LF1 live | Operator re-verify partial reopen on black after install | same plan (code done) |
| 3 | stacks SL5 | Live verify stack↔tab / merge / stacked profiles on black | [forge-stacked-layouts.md](./plans/forge-stacked-layouts.md) |
| 4 | layout polish | Live-drive bare-array `forge layout` | Day-to-day once LF* green |
| 5 | layout-sugar LS3/LS6 | Optional park + broader fixtures | Product bar already met |

**Shipped this session / recently**

| Item | Note |
| --- | --- |
| Two-pass mon claim | Planner unit OK; **live LF1 still open** |
| Tab/stack order+open on install | title-before-geo match; lastTabFocus on tab focus; raise all groups |
| Install focus preserve | focusWindowId survives id churn + shield thrash |
| STACKED Phase 1 keys | Stack mode on; tab↔stack + merge binds |
| STACKED SL0–SL4 | schema, save RT, thrash parity, CLI regression |
| Mon L/R + tab group order | `ensure_order` mon + in-tab |
| `workon` → `layout` | Full rename; host-aware save |
| layout-sugar LS1–2,4–5,7–8 | Main path done |

Product base: `~/dev/me/forge`, origin **lukebmay/forge**, lineage **`luke`**.

| Doc | Role |
| --- | --- |
| [forge-layout-reliability.md](./plans/forge-layout-reliability.md) | **Next** — tab focus + partial reopen thrash |
| [forge-stacked-layouts.md](./plans/forge-stacked-layouts.md) | STACKED product path (after LF*) |
| [forge-layout-sugar.md](./plans/forge-layout-sugar.md) | Main path **done** (LS1–2,4–5,7–8) |
| [docs/user/layout.md](../docs/user/layout.md) | Layout profiles (bare array first) |
| [forge-workon-thrash-zero.md](./plans/forge-workon-thrash-zero.md) | Historical thrash-zero |
| [forge-workon-reconcile.md](./plans/forge-workon-reconcile.md) | Historical reconcile |

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [layout reliability](./plans/forge-layout-reliability.md) LF2 | **Active** — tab focus; LF1 code done (live optional) |
| P1 | [stacked](./plans/forge-stacked-layouts.md) | Phase 1 **done**; SL5 live verify after LF* |
| P2 | Live layout daily-drive | Bare-array sugar live on black |
| P3 | [layout-sugar](./plans/forge-layout-sugar.md) LS3/LS6 | Optional; main path **done** |

### Done recently

| Item | Note |
| --- | --- |
| layout two-pass mon claim | unit green; live still filed as LF1 |
| layout list docs/tests | host-only table UX + tree-root; A/B AGREE |
| layout-sugar LS4–5 | bare save + docs/examples; A/B AGREE |
| layout-sugar LS7–8 | auto description + save K/D/E UX; A/B AGREE |
| layout-sugar LS1–2 | bare array + string/PWA inference; A/B AGREE |
| `forge update` always install | even when git already current |
| layout mon + tab order | ensure_order; live black OK |
| workon → layout rename | no BC |
| interim sugar / save compact | flat cells; string ghostty |
