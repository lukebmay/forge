# Session handoff — Meta probe (priority #1)

**Branch:** `task/meta-probe-harness`  
**Host:** `black`  
**Path:** `tests/meta-probe/`  
**Updated:** 2026-08-07 (core matrix + thrash sweeps green; Forge-off Meta baseline)

## Status

| Item | State |
| --- | --- |
| Harness reshape | **Shipped** `7ce020b` |
| Ghostty pilot | **Green** |
| Core-app single-ops 5× | **Green** (all five) |
| 2-step thrash sweeps | **Green at D=0** (ghostty, inkscape, obs; Forge off) |
| Next | X11 / other hosts **or** thrash with **Forge on** / layout rewrite from Meta baseline |

## Live results (black / wayland, Forge **off**)

| Run | Apps / maneuver | Result |
| --- | --- | --- |
| `full-suite/…211847Z` | ghostty 13 ops × 5 | all ok, thrash=0 |
| `full-suite/…213430Z` | nautilus, inkscape, grok, obs × 5 | all ok, thrash=0; per-app checkpoints OK |
| thrash-sweep ghostty | launch_then_{move,monitor} | lastGood **0** |
| thrash-sweep ghostty | launch_monitor_move | measured (0,0) |
| thrash-sweep inkscape/obs | 2-step D=1000→0 step 200 | lastGood **0** both maneuvers |

**Key finding:** With Forge disabled, Meta multi-op chains for core apps are thrash-free even at **D=0**. Inter-op thrash expected in product is likely **Forge-induced**, not a Meta floor. OBS needs longer settleDuration (~4s derived) than others (~3s).

## Core apps

nautilus · ghostty · inkscape · grok · obs — all single-op green on black/wayland.

## Next ordered work

1. Optional: thrash sweeps **with Forge enabled** (separate mode — product thrash edges)  
2. X11 on black; gray/green hosts later  
3. Layout engine rewrite using Meta baseline (near-zero inter-op delay when quiet) + measured settle floors  
4. Do **not** invent large inter-op sleeps without Forge-on thrash data  

## Commands

```bash
cd tests/meta-probe
python3 probe_driver.py prep --host black
python3 probe_driver.py run --host black --suite full-suite --samples 5
python3 probe_driver.py sweep --host black --apps inkscape --maneuver launch_then_move --d-start 1000 --d-step 200
python3 probe_driver.py cleanup
```

## Teardown (FIRM)

cleanup → WS1 + Forge + **sleep restore**. Never close Guake. No push unless asked.
