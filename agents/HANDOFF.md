# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (core matrix + thrash green; Meta D=0 baseline)  
**Branch:** `task/meta-probe-harness` (local commits; **no push**)  
**Active P0 next:** Layout engine rewrite **or** Forge-on thrash / X11 — see PRIORITY  
**Probe:** [`tests/meta-probe/SESSION_HANDOFF.md`](../tests/meta-probe/SESSION_HANDOFF.md)

---

## Campaign done this session

| Item | Status |
| --- | --- |
| Harness reshape (A/B) | **Done** `7ce020b` — 5×, core apps, sleep inhibit, per-app write, thrash + `sweep` |
| Ghostty pilot | **Green** |
| Core single-ops | **Green** nautilus, ghostty, inkscape, grok, obs |
| 2-step thrash (Forge off) | **lastGood D=0** for ghostty, inkscape, obs |
| Desktop restore | cleanup OK (Forge on, sleep restored) |

### Finding

Meta alone does not need multi-op inter-step delay for core apps on black/wayland. Product thrash is almost certainly Forge layout work. OBS settle floor ~4s; others ~3s.

### Next (pick)

1. Design/implement layout engine delays from Meta baseline (near-zero inter-op + settle floors)  
2. Probe thrash **with Forge on** for product edges  
3. X11 / gray / green hosts  

---

## Open human blockers (unchanged)

- hard: B-manual-black-session-verify (DPMS / lock)  
- hard: resize-autotile-design  
- soft: B-ap5-operator-visual-matrix  
- human: Wayland residual re-smoke after install+logout (RC)  

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
- Probe stays Forge-independent unless a task intentionally measures Forge-on  
