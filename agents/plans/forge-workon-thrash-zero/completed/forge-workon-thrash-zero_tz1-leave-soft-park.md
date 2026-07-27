# TZ1 — Residual leave default + soft park + no order thrash

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Done (implementer; tests green)  
**Priority:** P0  

## Acceptance

- [x] Default `marginal.residual: "leave"` — true residuals no action  
- [x] `residual: "park"` → soft park with `destWindowId` (claimed anchor)  
- [x] No overflow ensure_layout on soft park  
- [x] Already-sharing tab group → no structure (order-only thrash gone)  
- [x] Plan includes `thrashRisk`  
- [x] Docs DESIGN + workon.md  
- [x] Unit tests green (plan + apply)

## Session note

Shipped in planner/apply/CLI. Next: TZ2 thrash gate + `--safe`.
