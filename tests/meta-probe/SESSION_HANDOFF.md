# Session handoff — Meta probe full suite (priority #1)

**Branch:** `task/meta-probe-harness`  
**Host:** `black`  
**Path:** `tests/meta-probe/`  
**Priority:** **Top** — after Wayland restart, run this before anything else.

## Status

| Item | State |
| --- | --- |
| Agreement model v1 (hard/soft, duration settle) | **Implemented** |
| 1 cal + N full per app+op | **Implemented** |
| Bootstrap cal 10s @ 50ms → derive knobs | **Implemented** |
| Memory-only results; write at end | **Implemented** |
| Window cleanup + WS1 only when done | **Implemented** |
| black/wayland **full-suite** | **Ready** (next: you restart → agent runs) |

## Human

1. Logout/login **Wayland**  
2. Guake on **WS1**; leave test desk empty (driver uses index **3**)  
3. Do not touch windows/OS  
4. Say **start full suite** / **probe ready** / **proceed**

## Agent (top priority)

```bash
cd /home/luke/dev/me/forge
git checkout task/meta-probe-harness
cd tests/meta-probe

python3 -m unittest test_ext_state test_settle test_results -q
python3 probe_driver.py prep --host black

# Full suite: per op 1 cal + 10 full; bootstrap first cal @ 10s/50ms
python3 probe_driver.py run --host black --suite full-suite --samples 10

python3 analyze.py results/black/wayland/full-suite/latest.json
python3 probe_driver.py cleanup   # Forge on + WS1
```

**If budget is tight**, app groups (same suite path):

```bash
python3 probe_driver.py run --host black --suite full-suite --samples 10 \
  --apps nautilus,ghostty,inkscape,gnome-terminal
# then more --apps … as time allows
```

Skip **guake** unless `--include-guake`.

### Teardown rules (FIRM)

- Close every window the matrix opened (per app + final)  
- **Do not** switch to WS1 until the run is finished  
- End of run + `cleanup`: **WS1** (index 0)

### Do not

- Mid-run disk writes (driver writes once at end)  
- Leave Nautilus/Ghostty/Inkscape/etc. open  
- Wire probe into Forge layout engine  
- Push unless asked; SSH without **explicit**

## Agreement (v1)

| Outcome | Timer |
| --- | --- |
| hard `d_*` (hard signals) | **reset** |
| soft `s_*` (title/focus/raise/snapshot thrash) | record only |
| agreement | accumulate toward `settleDurationMs` |

See [AGREEMENT.md](./AGREEMENT.md).

## Namespace

`results/<host>/<session>/<suite>/`  
e.g. `black/wayland/full-suite/`

## Later

- **X11:** login Xorg → prep → run with `--session x11` (bootstrap again)  
- **gray/green:** same; expect longer derived `settleDurationMs`
