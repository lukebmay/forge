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
3. **Settle is a first-class gate** — agreement checks; hard signals reset stable
   duration. Do not start the next op until settled (or hard timeout + record fail).
4. **5 samples per (app, op)** by default (variance on black is tiny).
5. **Portable results** — host id, session type, Shell version, probe version in
   every run so black / slow machines can be compared later.
6. **Phase plan:** (A) single ops → (B) multi-op delay thrash sweeps → (C) layout engine.

## Layout

```text
tests/meta-probe/
  README.md                 # this file
  apps.json                 # apps under test (dev profile + inkscape)
  ops.json                  # Meta operations to exercise
  config.default.json       # settle knobs / sample counts
  probe_driver.py           # CLI: run / pilot / sweep, write results
  analyze.py                # summarize a results run
  lib/settle.py             # pure settle math (unit-testable)
  lib/thrash.py             # thrash criteria (unit-testable)
  lib/sweep.py              # delay schedules + last-good/first-fail
  lib/results.py            # atomic write + per-app checkpoint
  extension/                # minimal GNOME Shell extension (DBus + event log)
    metadata.json
    extension.js
  prep.sh / cleanup.sh      # Forge off/on + sleep inhibit/restore
  install-probe.sh          # symlink into ~/.local/share/gnome-shell/extensions
  results/                  # written JSON runs (host-tagged; gitignored data)
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

# 2) Prep — probe on, Forge+rivals off, sleep/idle inhibit
python3 tests/meta-probe/probe_driver.py prep --host black

# 3) Full matrix: core apps only, 1 cal + 5 full per app+op
python3 tests/meta-probe/probe_driver.py run --host black --suite full-suite
# or one app: --apps ghostty --samples 5
# → results/black/wayland/full-suite/  (checkpoint after each app)

python3 tests/meta-probe/analyze.py results/black/wayland/full-suite/latest.json

# 4) Multi-op thrash sweeps (delay high → down until thrash)
python3 tests/meta-probe/probe_driver.py sweep --host black --apps ghostty \
  --maneuver launch_then_move --d-start 2000 --d-step 100
python3 tests/meta-probe/probe_driver.py sweep --host black --apps ghostty \
  --maneuver launch_then_monitor --d-start 2000 --d-step 100
# 3-step isolation (optional: --hyp-monitor / --hyp-move from 2-step last-good)
python3 tests/meta-probe/probe_driver.py sweep --host black --apps ghostty \
  --maneuver launch_monitor_move --d1 2000 --d2 2000 --d-step 100

# 5) Cleanup — WS1 + Forge restore + **sleep inhibit restore**
python3 tests/meta-probe/probe_driver.py cleanup
```

**Results:** `results/<host>/<session>/<suite>/` — never mix Wayland and X11.  
**Agreement:** [AGREEMENT.md](./AGREEMENT.md) · **Handoff:** [SESSION_HANDOFF.md](./SESSION_HANDOFF.md)

Soft `s_*` never resets settle; hard `d_*` does. Close test windows; **WS1 only when finished**.  
**Never close Guake** (operator desk). `open_warm` is **opt-in only** (`--ops …,open_warm`).

## Defaults (reshape)

| Item | Default |
| --- | --- |
| Samples | **5** |
| Apps | tag **`core`**: nautilus, ghostty, inkscape, grok, obs |
| Ops | all single-ops **except `open_warm`** |
| Trial model | sticky window for non-open; `open_fresh` open→settle→**close** |
| Writes | **per-app checkpoint** (atomic); final updates `latest.json` |
| Prep | sleep/idle inhibit via `systemd-inhibit` (PID in prep-state) |

## Settle knobs (`config.default.json`)

| Knob | Meaning |
| --- | --- |
| `checkIntervalMs` | Agreement check period (full suite; cal uses 50ms) |
| `settleDurationMs` | Continuous **hard-stable** time required |
| `bootstrapSettleDurationMs` | First cal only (default **10000**) |
| `calibrationCheckIntervalMs` | Cal check period (default **50**) |
| `maxWaitMs` | Hard fail if not settled |
| `cooldownMs` | Pause after each trial |
| `samples` | Full trials per app+op **after** 1 calibration (default **5**) |

### Thrash (`thrash`)

| Knob | Meaning |
| --- | --- |
| `maxHardResets` | Thrash if `hardResetCount` exceeds this (default **20**) |
| `waitFactor` | Thrash if `waitMs > waitFactor * settleDurationMs` (default **4**) |

Also thrash on settle fail. Sweeps record **lastGoodMs** + **firstFailMs**.

### Sweep (`sweep`)

| Knob | Meaning |
| --- | --- |
| `dStartMs` / `dStepMs` / `dMinMs` | High→down delay schedule |
| `padMs` | Pad above 2-step last-good for 3-step starts |

Maneuvers: `launch_then_move`, `launch_then_monitor` (2-step); `launch_monitor_move` (3-step isolation).

No separate “verification” layer — only agreement checks. See AGREEMENT.md.

## What is recorded per trial

- Host, session (`wayland`/`x11`), Shell version, probe version, wall + mono times
- App id, op id, sample index (0..N-1)
- `thrash` / `thrashReason` from settle + knobs
- Settle summary: wait, hard resets, soft counts, checks timeline
- Sweep docs also store `sweepResults` (last-good / first-fail / hypothesis compare)

## Safety

- Probe may call `move_resize_frame` / `activate` / `move_to_monitor` on **target
  windows it opened**. Prefer the **test desk** (`preferIndex`, default 3).
- Never closes Guake unless the app under test is guake.
- Prep inhibits sleep; **cleanup always restores** (even partial paths).
- Do not leave Forge disabled if you need tiling after the session.

## Multi-machine later

Same `apps.json` / `ops.json` / config; change `--host` and copy `results/`.
Compare with `analyze.py --compare a.json b.json`.
