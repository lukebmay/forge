# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (next-session prep locked for meta-probe)  
**Branch:** `task/meta-probe-harness`  
**Active P0:** Harness reshape → multi-op thrash sweeps (2-step then isolated 3-step) → ghostty 5×  
**Probe path:** [`tests/meta-probe/`](../tests/meta-probe/)  
**Session start:** [`tests/meta-probe/SESSION_HANDOFF.md`](../tests/meta-probe/SESSION_HANDOFF.md)

---

## Campaign state

| Item | Status |
| --- | --- |
| First black/wayland single-op data | **Done** (local gitignored results; broad apps 10×) |
| Core apps | **nautilus, ghostty, inkscape, grok, obs** |
| Next session | (1) harness 5×/sleep/trial model (2) delay-until-thrash 2-step then 3-step isolation (3) ghostty pilot (4) rest |

### 3-step sweep (locked)

Pad D₁/D₂ from 2-step last-good → confirm thrashless → **lock one, decrease the other to thrash, reset** → swap axes → joint near-edge → **compare** smallest success to hypothesis. Details in SESSION_HANDOFF.

### Safety

Forge + rivals off; **sleep inhibit in prep, restore on cleanup**. No Guake close. WS1 only when finished.

---

## Operator next session

Wayland; Guake WS1 OK; empty test desk. Say **begin harness update** / **proceed**.

---

## Forge product residuals (parked during measurement)

Do **not** keep guessing layout timeouts until probe data exists.

| Symptom | Notes |
| --- | --- |
| mon1 VSPLIT vs HSPLIT after `layout dev` | Structure residual |
| Grok not open leaf | lastTabFocus / focus settle |
| YouTube overlay on other workspace | WS isolation / restack |
| Inkscape float-only / no border until drag | Admit + float save product gaps |

RC code (peel, etc.) remains on master; **live Wayland product smoke is secondary** to probe pilot this session.

---

## Agent rules

- **No push** unless human asks  
- **No SSH** without **explicit** in the current message  
- Measurement only under `tests/meta-probe/` — do not wire into Forge layout engine yet  
