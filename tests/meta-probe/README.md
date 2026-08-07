# Meta / Mutter app probe (Forge-independent)

**Purpose:** measure how **Meta** (GJS API) and **Mutter** (compositor) behave for
the apps Forge cares about — event counts and inter-event timing — **without**
Forge layout logic in the loop.

This is **analytics instrumentation**, not a tiler. Results here should drive a
later rewrite of Forge’s open/layout engine from stability-first data, not
guessed timeouts.

## Mutter vs Meta (one paragraph)

| Name | What it is |
| --- | --- |
| **Mutter** | The C compositor / window manager process that owns real windows, surfaces, monitors, and input. It is the ground truth for what is on screen. |
| **Meta** | The GObject API layer GNOME Shell (and extensions) use to talk to Mutter from GJS/C. `Meta.Window`, `Meta.Display`, signals like `size-changed` are **Meta**. |

Forge (and this probe) never link Mutter C directly; they observe and call through
**Meta**. “Wait for Meta to settle” means: stop seeing Meta signals that matter,
and Meta-reported frame/monitor/workspace agree with a quiet baseline.

## Design principles

1. **No Forge code paths** in the measurement loop (disable Forge while collecting).
2. **Serial ops first** — one operation, full settle, next trial. No parallel.
3. **Settle is a first-class gate** — configurable quiet window, agreement count,
   max wait. Do not start the next op until settled (or hard timeout + record fail).
4. **10 samples per (app, op)** by default; longer cool-downs between trials.
5. **Portable results** — host id, session type, Shell version, probe version in
   every run so black / slow machines can be compared later.
6. **Phase plan:** (A) single ops → (B) two ops in sequence → (C) parallel later.

## Layout

```text
tests/meta-probe/
  README.md                 # this file
  apps.json                 # apps under test (dev profile + inkscape)
  ops.json                  # Meta operations to exercise
  config.default.json       # settle knobs / sample counts
  probe_driver.py           # CLI: run matrix, write results
  analyze.py                # summarize a results run
  lib/settle.py             # pure settle math (unit-testable)
  lib/results.py            # result file helpers
  extension/                # minimal GNOME Shell extension (DBus + event log)
    metadata.json
    extension.js
  install-probe.sh          # symlink into ~/.local/share/gnome-shell/extensions
  results/                  # written JSON runs (host-tagged)
```

## Prerequisites

- GNOME Shell 45+ (tested target: 46 on `black`)
- Wayland or X11 (recorded in results; **do not mix** when comparing)
- **Forge + rival tilers disabled** during measurement
- Probe extension enabled (needs **logout** on Wayland after first install)

```bash
# 1) First-ever install needs one Wayland logout so Shell sees the extension.
./tests/meta-probe/install-probe.sh
# → logout / login once

# 2) Agent (or you) prep — enables probe, disables Forge+rivals, preflight
python3 tests/meta-probe/probe_driver.py prep --host black

# 3) Full matrix: 1 cal + 10 full per app+op (bootstrap first cal @ 10s / 50ms)
python3 tests/meta-probe/probe_driver.py run --host black --suite full-suite --samples 10
# → results/black/wayland/full-suite/  (single JSON write at end)

python3 tests/meta-probe/analyze.py results/black/wayland/full-suite/latest.json

# 4) Restore desktop when done: WS1 + Forge
python3 tests/meta-probe/probe_driver.py cleanup
```

**Results:** `results/<host>/<session>/<suite>/` — never mix Wayland and X11.  
**Agreement:** [AGREEMENT.md](./AGREEMENT.md) · **Handoff:** [SESSION_HANDOFF.md](./SESSION_HANDOFF.md)

Soft `s_*` never resets settle; hard `d_*` does. Close test windows; **WS1 only when finished**.

## Settle knobs (`config.default.json`)

| Knob | Meaning |
| --- | --- |
| `checkIntervalMs` | Agreement check period (full suite; cal uses 50ms) |
| `settleDurationMs` | Continuous **hard-stable** time required |
| `bootstrapSettleDurationMs` | First cal only (default **10000**) |
| `calibrationCheckIntervalMs` | Cal check period (default **50**) |
| `maxWaitMs` | Hard fail if not settled |
| `cooldownMs` | Pause after each trial |
| `samples` | Full trials per app+op **after** 1 calibration |

No separate “verification” layer — only agreement checks. See AGREEMENT.md.

## What is recorded per trial

- Host, session (`wayland`/`x11`), Shell version, probe version, wall + mono times
- App id, op id, sample index (0..N-1)
- `t0` = op issued; all probe events until settled
- Per-event: mono_ms, signal, window_id, frame rect, monitor, workspace, wm_class
- Derived: event counts by signal, inter-event deltas, time-to-first-event,
  time-to-quiet, time-to-settled, final frame vs requested (for move/resize)

## Safety

- Probe may call `move_resize_frame` / `activate` / `move_to_monitor` on **target
  windows it opened** (or you opted in). Prefer a **dedicated empty workspace**.
- Does not kill apps by default; `run --close-after` optional.
- Do not leave Forge disabled if you need tiling after the session.

## Multi-machine later

Same `apps.json` / `ops.json` / config; change `--host` and copy `results/`.
Compare with `analyze.py --compare a.json b.json`.
