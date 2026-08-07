# Meta probe — collection protocol

## Terminology (locked — agreement model)

See full contract: [AGREEMENT.md](./AGREEMENT.md).

| Term | Meaning |
| --- | --- |
| **Agreement check** | One intervalic poll: drain hard/soft signals + compare snapshot to contract. **Not** a separate “verification” concept. |
| **Agreement** | Hard contract holds → settle duration continues. |
| **Hard disagreement** (`d_*`) | Layout-relevant mismatch → **resets** settle duration to 0. |
| **Soft disagreement** (`s_*`) | Noisy non-layout signal (title, focus, raise-alone) → **recorded, does not reset** timer. |
| **Settled** | Continuous **hard-stable** duration ≥ `settleDurationMs` (default **3s**). Soft noise does not interrupt. |

**Contract v1 soft (no reset):** `s_title`, `s_focus`, `s_raise`.  
**Hard resets:** frame/monitor/workspace/max/fs/min/class and hard signals — see AGREEMENT.md.

Legacy pilot used verify + agreeCount; new runs follow this document.

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
