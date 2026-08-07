# Meta probe — collection protocol

## Terminology (locked)

| Term | Meaning |
| --- | --- |
| **Verification** | One poll of Meta: drain events (+ optional `SnapshotWindow`). Can be frequent. |
| **Agreement tick** | A verification where the window has been **quiet** for ≥ `quietMs`, and ≥ `agreementIntervalMs` (default **2s**) has passed since the previous agreement tick. |
| **Settled** | `agreeCount` (default **5**) consecutive agreement ticks without a quiet reset. |
| **Dense verify mode** | Samples 0–4: poll every **50ms** (rich event/snapshot series). Agreement still only every **2s**. |
| **Sparse verify mode** | Samples 5–9: poll every **2s** (lower Meta query load). Same agreement rules. |

Minimum settle wall time when already quiet: about `agreeCount × agreementIntervalMs` ≈ **10s**.

## Safety (every run)

1. **Forge disabled**
2. **All rival tilers disabled** (same list as Forge’s `rival-tilers.js`)
3. **Probe enabled** (`meta-probe@forge-test.local`)
4. Prefer **empty workspace** (driver switches to index **3** by default)
5. **When testing finishes** — always return to **human WS1** (0-based index **0**) so the operator sees the session is done

```bash
# Prefer scripted prep (parses Enabled: Yes / State: ACTIVE correctly):
python3 tests/meta-probe/probe_driver.py prep --host black
python3 tests/meta-probe/probe_driver.py preflight --host black
```

**Extension state note:** GNOME 45+ reports `Enabled: Yes|No` and `State: ACTIVE|INACTIVE`.
Do **not** match only `State: ENABLED` — that race left Forge running in early pilots.

## Operator desk (PM)

**Clean empty workspace is enough** if:

- No other windows on the **test workspace**
- Forge + rivals off
- Agent control is **not** creating windows on that workspace

Recommended for long runs:

- Leave daily apps on **human WS1** (0-based index **0**); Guake/chat stays there
- Agent uses **test workspace index 3** (config `workspace.preferIndex`, default 3)
- You drive the agent via **Guake** (often float/overlay) **or SSH from gray/green** so chat/IDE is not on the test desk

### Workspace return (FIRM for agents)

| Index (0-based) | Human name | Role |
| --- | --- | --- |
| `0` | **WS1** | Operator desk — Guake / agent control. **Return here when testing ends.** |
| `3` | (config default) | Test desk — empty; driver switches here for runs |

```bash
# End of every measurement session (also done by cleanup.sh):
python3 tests/meta-probe/probe_driver.py focus-workspace 0
# or: cleanup (focuses returnIndex then restores extensions)
python3 tests/meta-probe/probe_driver.py cleanup
```

Closing *all* session windows is optional, not required.

## After Wayland restart (first time)

```bash
# already linked by install-probe.sh
gnome-extensions enable meta-probe@forge-test.local
gnome-extensions disable forge@jmmaranan.com
python3 tests/meta-probe/probe_driver.py preflight --host black
```

## Pilot sequence (agent runs this)

```bash
cd /home/luke/dev/me/forge/tests/meta-probe

# Micro: one op sanity (optional)
python3 probe_driver.py pilot --host black --stage stage1-nautilus \
  --ops open_fresh,move_resize --samples 1

# Stage 1: Nautilus, all ops, 2 samples
python3 probe_driver.py pilot --host black --stage stage1-nautilus --samples 2

# Stage 2: Ghostty
python3 probe_driver.py pilot --host black --stage stage2-ghostty --samples 2

# Stage 3: Inkscape
python3 probe_driver.py pilot --host black --stage stage3-inkscape --samples 2

# Or all pilot stages:
python3 probe_driver.py pilot --host black
```

## Full science matrix (after calibration green)

```bash
python3 probe_driver.py run --host black --suite full-suite --samples 10
python3 analyze.py results/black/wayland/full-suite/latest.json
```

Result paths are namespaced: `results/<host>/<session>/<suite>/`  
(`session` = `wayland` | `x11` from `XDG_SESSION_TYPE` or `--session`).

## Calibration before full-suite (each host × session)

See [CALIBRATION.md](./CALIBRATION.md). Short form:

```bash
python3 probe_driver.py calibrate --host black   # → …/calibration/
# decide knobs from timeToQuiet vs waitMs; then full-suite
```

**black/wayland** already calibrated (2026-08-07): full-suite uses `agreeCount=3`.  
Recalibrate on **x11** and on **gray/green**.

## Multi-host later

| Host | Role |
| --- | --- |
| `black` | Primary dual-4K daily |
| `gray` | ~2018 laptop |
| `green` | ~2012 desktop |

Same tree; `--host gray` / `--host green`. Copy whole `results/<host>/` trees.

## Open-method note

- **PWA desktop / app-id** vs **fixed URL** chrome windows are separate app ids
  (`youtube` vs `youtube-url`, `google-chrome` vs `google-chrome-url`).
- **open_fresh** vs **open_warm** are separate ops (not the same measurement).
