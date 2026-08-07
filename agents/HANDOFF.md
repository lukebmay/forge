# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (ghostty pilot green; core matrix next)  
**Branch:** `task/meta-probe-harness` (ahead of origin by 1 commit, no push)  
**Active P0:** Meta probe **core-app matrix** (nautilus, inkscape, grok, obs)  
**Probe path:** [`tests/meta-probe/`](../tests/meta-probe/)  
**Session:** [`tests/meta-probe/SESSION_HANDOFF.md`](../tests/meta-probe/SESSION_HANDOFF.md)

---

## Campaign state

| Item | Status |
| --- | --- |
| Harness reshape | **Done** `7ce020b` — A/B AGREE, 48 unit tests |
| Ghostty pilot live | **Green** — single-ops 5× all ok; 2-step + 3-step thrash-free at **D=0** (Forge off) |
| Core-app matrix | **Next** |
| Layout engine rewrite from data | After matrix / thrash edges on hard apps |

### Ghostty finding

Meta alone (Forge disabled) handles ghostty multi-op at zero inter-step delay. Look for thrash edges on **inkscape / obs** next; D=0 is the ghostty Meta baseline.

### How to continue

```bash
cd tests/meta-probe
python3 probe_driver.py prep --host black
python3 probe_driver.py run --host black --suite full-suite --samples 5   # all core
# or per-app + sweeps for hard apps
python3 probe_driver.py cleanup
```

### Safety

Sleep inhibit in prep; restore on cleanup. No Guake close. WS1 only when finished.

---

## Forge product residuals (parked)

Do not guess layout timeouts until more probe thrash data exists.

---

## Agent rules

- **No push** unless human asks  
- **No SSH** without **explicit**  
- Measurement only under `tests/meta-probe/`  
