# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (apply-contract **locked**; AC1 in progress)  
**Branch:** `plan/forge-layout-apply-contract`  
**Active P0:** [forge-layout-apply-contract](./plans/forge-layout-apply-contract.md) AC1 purge  
**Live smoke:** deferred (Wayland — no HUP this session)

---

## Campaign

| Item | Status |
| --- | --- |
| Meta baseline (Forge-off D=0) | **Done** |
| Apply/settle contract design | **Locked** |
| AC1 purge verify war | **in progress** |
| AC2+ | queued after AC1 AGREE |

### Next

1. Finish AC1 A/B → wrap-up commit  
2. AC2 command epoch  
3. AC3 streaming · AC4 placeholder · AC5 slot math  
4. AC6 live smoke when X11 HUP or logout available  

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
