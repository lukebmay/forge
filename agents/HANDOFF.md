# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (meta-probe harness on `task/meta-probe-harness`)  
**Branch:** `task/meta-probe-harness` (commit locally; no push unless asked)  
**Active P0:** **Meta/Mutter probe pilot** — stability data before more layout guessing  
**Probe path:** [`tests/meta-probe/`](../tests/meta-probe/)  
**Session start:** [`tests/meta-probe/SESSION_HANDOFF.md`](../tests/meta-probe/SESSION_HANDOFF.md)

---

## What changed (this prep)

Stability rewrite is **blocked on data**, not more Forge timeout knobs.

| Item | Status |
| --- | --- |
| `tests/meta-probe/` harness (extension + driver + settle model) | **Ready** |
| Probe symlink install | **Done** on black (`install-probe.sh`) |
| Probe **enabled** in live Shell | **Needs Wayland logout** |
| Pilot (nautilus → ghostty → inkscape) | **Next** after enable |
| Full 10-sample matrix | After pilot green |
| Hosts later | `black`, `gray` (~2018), `green` (~2012) |

### Settle model (locked for science)

- **Verification** = poll Meta (events ± snapshot); may be dense  
- **Agreement tick** = quiet ≥500ms **and** ≥**2s** since last tick  
- **Settled** = **5** agreement ticks  
- Samples 0–4 dense (50ms poll); 5–9 sparse (2s poll)  
- **open_fresh** and **open_warm** are distinct ops  
- Chrome **desktop/PWA** vs **fixed URL** are distinct app entries  

### Safety

Forge **and** rival tilers **must** be disabled during runs.  
Driver `preflight` enforces this.

---

## Operator (human) — before agent pilot

1. **Logout → login** (Wayland) so `meta-probe@forge-test.local` can load  
2. Optional: Guake or SSH for chat; leave **workspace 3** empty  
3. Tell agent: **start preliminary testing** / **probe ready**

Agent runs `python3 probe_driver.py prep --host black` (all enable/disable), then pilot.
End of session: `python3 probe_driver.py cleanup`.

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
