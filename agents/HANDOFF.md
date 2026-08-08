# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (apply-contract **code complete** AC1–AC5)  
**Branch:** `master` (plan branch merged per slice)  
**Active P0 next:** **AC6 live smoke** when X11 HUP or logout available  
**Live smoke:** deferred (Wayland — no HUP this session)

---

## Campaign: layout apply/settle contract

| Item | Status | Commit |
| --- | --- | --- |
| Design lock | **Done** | plan doc |
| AC1 purge verify war | **done** | `333f8bf` |
| AC2 command epoch | **done** | `b20c227` |
| AC3 drop LF6 fingerprint default | **done** | `9633290` |
| AC4 placeholder thrash isolate | **done** | `cf453cb` |
| AC5 slot-math unit tests | **done** | (this wrap) |
| AC6 live smoke | **deferred** | Wayland |
| AC7 residual nudge | later | after visual QA |

### One-line contract

Plan with tree math → parallel launch → place when admissible → post-apply =
echo residual (350ms) → thrash → float + placeholder — never thrash the forest.

### Operator next (AC6)

When on X11 (HUP) or after Wayland logout:

1. Install + enable Forge  
2. `forge layout dev` (no fingerprint wait by default)  
3. Focus walk, tab switch, thrash isolate if needed  
4. Optional: `FORGE_LAYOUT_WAIT_TREE_STABLE=1` only for debug  

---

## Open human blockers

- hard: B-manual-black-session-verify (DPMS / lock)  
- hard: resize-autotile-design  
- soft: B-ap5-operator-visual-matrix  
- human: Wayland residual re-smoke after install+logout (RC)  
- deferred: AC6 apply-contract live smoke  

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
