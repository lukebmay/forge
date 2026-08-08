# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (apply-contract **AC1–AC6 complete**)  
**Branch:** `master` / `plan/forge-layout-apply-contract` (same tip)  
**Active P0 next:** RC Wayland residual re-smoke (human logout) or AC7 residual nudge later  
**Live smoke:** **AC6 green on X11** (2026-08-07)

---

## Campaign: layout apply/settle contract

| Item | Status | Commit |
| --- | --- | --- |
| Design lock | **Done** | plan doc |
| AC1 purge verify war | **done** | `333f8bf` |
| AC2 command epoch | **done** | `b20c227` |
| AC3 drop LF6 fingerprint default | **done** | `9633290` |
| AC4 placeholder thrash isolate | **done** | `cf453cb` |
| AC5 slot-math unit tests | **done** | `df60734` |
| AC6 live smoke | **done** | X11 live (docs wrap) |
| AC7 residual nudge | later | after visual QA |

### One-line contract

Plan with tree math → parallel launch → place when admissible → post-apply =
echo residual (350ms) → thrash → float + placeholder — never thrash the forest.

### Operator next (RC)

Wayland residual re-smoke after install+logout when ready. Optional: cold
`forge layout dev` may need a second pass (Mode B thrash-recover) if first
multi-open lands wrong mon.

---

## Open human blockers

- hard: B-manual-black-session-verify (DPMS / lock)  
- hard: resize-autotile-design  
- soft: B-ap5-operator-visual-matrix  
- human: Wayland residual re-smoke after install+logout (RC)  

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
