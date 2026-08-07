# Session handoff — Meta probe full matrix

**Date prepared:** 2026-08-07  
**Branch:** `task/meta-probe-harness`  
**Host:** `black`  
**Path:** `tests/meta-probe/`  

## Status

| Item | State |
| --- | --- |
| Prep Forge-disable bug | **Fixed** |
| black/wayland calibration (pilot n=2) | **Green** — knobs tuned for full-suite |
| Result namespace | `results/<host>/<session>/<suite>/` |
| black/wayland **full-suite** n=10 | **Ready** (next session) |
| black/x11 calibration + full-suite | **Queued** (after X11 login) |
| gray/green | Calibrate first on each |

## Human

1. Logout/login as needed (Wayland for full-suite; later X11 for session compare)  
2. Guake on **WS1**; leave test desk empty (driver uses index **3**)  
3. Do not touch windows/OS during runs  
4. Say **start full suite** / **probe ready**  

## Agent — black Wayland full suite (this restart)

```bash
cd /home/luke/dev/me/forge
git checkout task/meta-probe-harness
cd tests/meta-probe

python3 -m unittest test_ext_state test_settle test_results -q
python3 probe_driver.py prep --host black
# session auto from XDG_SESSION_TYPE; override only if needed: --session wayland

# Full science matrix (guake excluded unless --include-guake)
python3 probe_driver.py run --host black --suite full-suite --samples 10

python3 analyze.py results/black/wayland/full-suite/latest.json
# End: restore Forge + WS1
python3 probe_driver.py cleanup
```

If token budget is tight, run app groups under the **same** suite/namespace:

```bash
python3 probe_driver.py run --host black --suite full-suite --samples 10 \
  --apps nautilus,ghostty,inkscape,gnome-terminal
python3 probe_driver.py run --host black --suite full-suite --samples 10 \
  --apps google-chrome,google-chrome-amazon,firefox
# …etc. Each write is a separate run-*.json under full-suite/
```

**Stop** on prep/preflight failure, shell crash, or repeated settle timeouts → focus WS1, note failure, do not thrash.

## Agreement model (design lock)

| Outcome | Timer |
| --- | --- |
| hard agreement | accumulates toward `settleDurationMs` (~3s) |
| hard disagreement `d_*` | **reset** |
| soft disagreement `s_*` (title, focus, raise-alone) | **record only — no reset** |

Full contract: [AGREEMENT.md](./AGREEMENT.md). Soft data is kept for chrome/focus analysis; layout settle keys off hard only.

## Knobs (target; implement may still lag)

| Knob | Calibration | Full 10× |
| --- | --- | --- |
| checkIntervalMs | dense (~100ms) | cal-derived, clamped |
| settleDurationMs | 3000 | **same** (soft does not change this) |
| samples | 1 cal + then 10 full per app+op | — |

Rationale: [CALIBRATION.md](./CALIBRATION.md) · [AGREEMENT.md](./AGREEMENT.md).

## Namespace

```text
results/black/wayland/calibration/   # prior pilot + future calibrate
results/black/wayland/full-suite/    # this session
results/black/x11/calibration/       # after X11 login
results/black/x11/full-suite/
```

## Workspace (FIRM)

| Index | Human | Role |
| --- | --- | --- |
| **0** | **WS1** | Operator / Guake — **return when done** (`cleanup` does this) |
| **3** | test desk | Measurement (`preferIndex`) |

## Later sessions

### X11 on black

```bash
# after login to X11
python3 probe_driver.py prep --host black
python3 probe_driver.py calibrate --host black --session x11
# if timeToQuiet still ≪ wait → 
python3 probe_driver.py run --host black --session x11 --suite full-suite --samples 10
python3 probe_driver.py cleanup
```

### gray / green

Always `calibrate` first; only then full-suite (or `--suite strict` if thrashy).

## FIRM

- No push unless asked; no SSH without **explicit**  
- Do not wire probe into Forge layout engine yet  
- Always **WS1** when testing ends  
- Skip **guake** app while agent runs inside Guake  
