# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (harness reshape shipped; ghostty pilot next)  
**Branch:** `task/meta-probe-harness`  
**Active P0:** Live **ghostty pilot** (single-ops 5× → 2-step sweeps → 3-step if ready) then rest of core apps  
**Probe path:** [`tests/meta-probe/`](../tests/meta-probe/)  
**Session start:** [`tests/meta-probe/SESSION_HANDOFF.md`](../tests/meta-probe/SESSION_HANDOFF.md)

---

## Campaign state

| Item | Status |
| --- | --- |
| Harness reshape (5×, core, sleep, trial, thrash, sweep CLI) | **Done** — A/B AGREE, unit tests 48 OK |
| Multi-op delay-until-thrash code | **Done** (`probe_driver.py sweep`) |
| Ghostty pilot live | **Next** |
| Core-app matrix (5 apps) | After ghostty green |

### How to run pilot

```bash
cd tests/meta-probe
python3 probe_driver.py prep --host black
python3 probe_driver.py run --host black --suite full-suite --apps ghostty --samples 5
python3 probe_driver.py sweep --host black --apps ghostty --maneuver launch_then_move --d-start 2000 --d-step 100
python3 probe_driver.py sweep --host black --apps ghostty --maneuver launch_then_monitor --d-start 2000 --d-step 100
# then 3-step with padded last-good D1/D2
python3 probe_driver.py cleanup
```

### Safety

Forge + rivals off during prep; **sleep inhibit in prep, restore on cleanup**. No Guake close. WS1 only when finished.

---

## Forge product residuals (parked during measurement)

Do **not** keep guessing layout timeouts until probe data exists.

| Symptom | Notes |
| --- | --- |
| mon1 VSPLIT vs HSPLIT after `layout dev` | Structure residual |
| Grok not open leaf | lastTabFocus / focus settle |
| YouTube overlay on other workspace | WS isolation / restack |
| Inkscape float-only / no border until drag | Admit + float save product gaps |

RC code remains on master; **live Wayland product smoke is secondary** to probe pilot.

---

## Agent rules

- **No push** unless human asks  
- **No SSH** without **explicit** in the current message  
- Measurement only under `tests/meta-probe/` — do not wire into Forge layout engine yet  
