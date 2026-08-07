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

# 3) Calibrate host×session (strict knobs, n=2) — skip if already green for this pair
python3 tests/meta-probe/probe_driver.py calibrate --host black
# → results/black/wayland/calibration/  (or …/x11/… when on X11)

# 4) Full matrix (tuned knobs after calibration)
python3 tests/meta-probe/probe_driver.py run --host black --suite full-suite --samples 10
python3 tests/meta-probe/analyze.py results/black/wayland/full-suite/latest.json

# 5) Restore desktop: focus WS1 (index 0), disable probe, re-enable Forge/rivals
python3 tests/meta-probe/probe_driver.py cleanup
```

**Results namespace:** `results/<host>/<session>/<suite>/` — never mix Wayland and X11.

**Knobs / calibration:** [CALIBRATION.md](./CALIBRATION.md)

**After testing:** always leave the operator on **WS1** (0-based index **0**).
`cleanup` does this before disabling the probe.

**Handoff:** [SESSION_HANDOFF.md](./SESSION_HANDOFF.md) · [PROTOCOL.md](./PROTOCOL.md)

## Settle knobs (`config.default.json`)

| Knob | Meaning |
| --- | --- |
| `quietMs` | No relevant Meta events for this long → eligible for agreement |
| `agreementIntervalMs` | Min time **between official agreement ticks** (default **2000**) |
| `agreeCount` | Consecutive agreement ticks → **settled** (default **5**) |
| dense `pollMs` | Samples 0–4: frequent verifications (default 50ms) |
| sparse `pollMs` | Samples 5–9: deliberate verifications (default 2000ms) |
| `maxWaitMs` | Hard fail if not settled |
| `cooldownMs` | Extra wait after settled before next trial |
| `samples` | Trials per (app, op) — default **10** |

**Verification** ≠ **agreement**. Verifications can be dense for data; agreement
ticks are always 2s-spaced while quiet. See PROTOCOL.md.

Debug “fully serialized” mode is the **default** for `run` / `pilot`. No parallel
path in v1.

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
