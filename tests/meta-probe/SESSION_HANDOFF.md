# Session handoff — Meta probe (priority #1)

**Branch:** `task/meta-probe-harness`  
**Host:** `black`  
**Path:** `tests/meta-probe/`  
**Updated:** 2026-08-07 (ghostty pilot live green; core matrix next)

## Status

| Item | State |
| --- | --- |
| Agreement settle v1 | **Shipped** |
| First black/wayland data (10×, broad apps) | **Collected** (local results gitignored) |
| Harness reshape (5×, core apps, sleep, trial model) | **Shipped** (`7ce020b`) |
| Multi-op delay-until-thrash (2-step, then 3-step) | **Shipped** + **ghostty live** |
| Ghostty pilot (bootstrap → 5× → teardown) | **Green** (2026-08-07) |
| Core-app matrix (5 apps) | **Next** — nautilus, inkscape, grok, obs (+ optional re-ghostty) |

## Ghostty pilot results (black / wayland)

Local only (`results/` gitignored):

| Run | Result |
| --- | --- |
| `full-suite/run-full-suite-20260807T211847Z.json` | ghostty × 13 ops × 5 full: **78 trials, all ok, thrash=0** |
| `thrash-sweep/…212413Z` | `launch_then_move` D=2000→0: **lastGood=0**, firstFail=None |
| `thrash-sweep/…212725Z` | `launch_then_monitor` D=2000→0: **lastGood=0**, firstFail=None |
| `thrash-sweep/…213039Z` | `launch_monitor_move` isolation: **measured (D1,D2)=(0,0)** thrashless |

**Derived knobs after pilot:** settleDurationMs=3000, checkIntervalMs ended ~250.

**Finding:** With Forge **off**, ghostty Meta ops + multi-op chains are thrash-free even at **D=0**. Inter-op delays for the layout engine may only show thrash under Forge load or harder apps (inkscape/obs). Record D=0 as Meta baseline for ghostty.

## Core apps only (FIRM)

| id | Why |
| --- | --- |
| **nautilus** | GTK baseline |
| **ghostty** | Dev terminal thrash — **pilot done** |
| **inkscape** | Late-map / creative difficult |
| **grok** | Single PWA stand-in |
| **obs** | Heavy creative / multi-surface |

## Next session — ordered work

1. **Core-app matrix** — same harness: prep → run full-suite (default core, or per-app) → 2-step sweeps → 3-step where 2-step has non-zero edge → cleanup  
2. Prefer **inkscape** and **obs** early if looking for thrash edges  
3. Keep ghostty D=0 baseline; only re-run if harness churns  
4. Later: X11 / gray/green; layout engine rewrite from thrash-free delays  

## Agent commands

```bash
cd /home/luke/dev/me/forge
git checkout task/meta-probe-harness
cd tests/meta-probe
python3 -m unittest test_ext_state test_settle test_results test_thrash test_sweep -q
python3 probe_driver.py prep --host black
python3 probe_driver.py run --host black --suite full-suite --samples 5
# or one app:
python3 probe_driver.py run --host black --suite full-suite --apps inkscape --samples 5
python3 probe_driver.py sweep --host black --apps inkscape --maneuver launch_then_move --d-start 2000 --d-step 100
python3 probe_driver.py cleanup
```

## Pre-session checklist

| Step | Who |
| --- | --- |
| Branch `task/meta-probe-harness` | agent |
| Wayland; Guake OK on WS1; test desk free (index 3) | human |
| prep (sleep inhibit + probe; Forge off) | agent |
| Do not touch desk during run | human |

## Teardown rules (FIRM)

- Close every matrix-opened window  
- **No WS1** until finished  
- cleanup: WS1 + Forge restore + **sleep restore**  
- Never close Guake  

## Do not

- Wire probe into Forge layout engine yet  
- Push unless asked; SSH without **explicit**  
- Mutate idle/sleep without restore in cleanup  

## Namespace

`results/<host>/<session>/<suite>/`  
e.g. `black/wayland/full-suite/`, `black/wayland/thrash-sweep/` (gitignored data)
