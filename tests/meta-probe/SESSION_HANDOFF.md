# Session handoff — Meta probe pilot (after Wayland restart)

**Date prepared:** 2026-08-07  
**Branch:** `task/meta-probe-harness`  
**Host:** `black` (later `gray`, `green`)  
**Path:** `tests/meta-probe/`

## Human (only)

1. **Logout → login** (Wayland) so the probe extension can load  
2. Optional: Guake or SSH for chat; leave **workspace 3** empty  
3. Tell agent: **start preliminary testing** / **probe ready**

Do **not** manually enable/disable extensions unless prep fails.

## Agent start (all prep is scripted)

```bash
cd /home/luke/dev/me/forge
git checkout task/meta-probe-harness   # if not already
cd tests/meta-probe

# Prep: symlink probe, disable forge+rivals, enable probe, preflight
python3 probe_driver.py prep --host black
# equivalent: ./prep.sh black

# Micro smoke
python3 probe_driver.py pilot --host black --stage stage1-nautilus \
  --ops open_fresh,move_resize --samples 1

# Pilot stages
python3 probe_driver.py pilot --host black --stage stage1-nautilus --samples 2
python3 probe_driver.py pilot --host black --stage stage2-ghostty --samples 2
python3 probe_driver.py pilot --host black --stage stage3-inkscape --samples 2

python3 analyze.py results/latest.json
```

## When measurement session ends

```bash
python3 probe_driver.py cleanup
# restores forge/rivals from prep state; leaves probe disabled
```

## Full matrix (after pilot green)

```bash
python3 probe_driver.py prep --host black   # if cleaned up
python3 probe_driver.py run --host black --samples 10
python3 probe_driver.py cleanup
```

### Full suite apps (tag `full`)

| Group | Apps |
| --- | --- |
| Pilot | nautilus, ghostty, inkscape |
| Chrome | blank window, **Amazon** heavy URL |
| PWAs | Grok, YouTube, Gmail, Google Voice |
| Browsers | firefox |
| Electron | code (VS Code), slack (skip if missing) |
| Overlay | guake |
| Creative | gimp, **kdenlive** (video; skip if missing), **obs** (live/podcast) |
| Terminal | gnome-terminal |
| Games | steam (skip if missing) |

Missing binaries with `skip-if-missing` are skipped, not hard-failed.

## Settle (do not speed up)

quietMs=500 · agreementIntervalMs=2000 · agreeCount=5 · dense samples 0–4 / sparse 5–9

## FIRM

- No push unless asked  
- No SSH without **explicit** in user message  
- Do not wire probe into Forge layout engine yet  
