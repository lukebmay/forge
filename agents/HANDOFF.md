# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (apply-contract **locked**; AC1 in progress)  
**Branch:** `plan/forge-layout-apply-contract`  
**Active P0:** [forge-layout-apply-contract](./plans/forge-layout-apply-contract.md) AC2 command epoch  
**Live smoke:** deferred (Wayland — no HUP this session)

---

## Campaign

| Item | Status |
| --- | --- |
| Meta baseline (Forge-off D=0) | **Done** |
| Apply/settle contract design | **Locked** |
| AC1 purge verify war | **done** (merged master) |
| AC2 command epoch | **in progress** |
| AC3–AC5 | queued |

### Next

1. Finish AC2 A/B → wrap-up commit  
2. AC3 streaming · AC4 placeholder · AC5 slot math  
3. AC6 live smoke when X11 HUP or logout available  

---

## Open human blockers (unchanged)

- hard: B-manual-black-session-verify (DPMS / lock)  
- hard: resize-autotile-design  
- soft: B-ap5-operator-visual-matrix  
- human: Wayland residual re-smoke after install+logout (RC)  
- deferred: AC6 live smoke for apply-contract  

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
- Probe stays Forge-independent unless a task intentionally measures Forge-on  
