# Session handoff — Meta probe (priority #1)

**Branch:** `task/meta-probe-harness`  
**Host:** `black`  
**Path:** `tests/meta-probe/`  
**Updated:** 2026-08-07 (next-session prep locked; commit when ready)

## Status

| Item | State |
| --- | --- |
| Agreement settle v1 | **Shipped** |
| First black/wayland data (10×, broad apps) | **Collected** (local results gitignored) |
| Harness reshape (5×, core apps, sleep, trial model) | **Next session #1** |
| Multi-op delay-until-thrash (2-step, then 3-step) | **Next session #2** |
| Ghostty pilot (bootstrap → 5× → teardown) | **Next session #3** |
| Core-app matrix (5 apps) | After ghostty green |

## What we already have (single-op baselines)

Local only (`results/` is gitignored):

| Run | Apps |
| --- | --- |
| `run-full-suite-20260807T191821Z.json` | nautilus, ghostty, inkscape, google-chrome |
| `run-full-suite-20260807T200000Z.json` | google-chrome-amazon, youtube, gmail, google-voice |
| `run-full-suite-20260807T201039Z.json` | grok |

**Findings:** 0 settle fails; waits ~3s settle floor; variance tiny on black → **5 samples enough**; `open_warm` piles multi-instance windows; sleep mid-run killed probe; memory-only write lost first long matrix.

**Out of matrix:** extra PWAs, Code, gnome-terminal, steam/slack/kdenlive, etc.

## Core apps only (FIRM)

| id | Why |
| --- | --- |
| **nautilus** | GTK baseline |
| **ghostty** | Dev terminal thrash |
| **inkscape** | Late-map / creative difficult |
| **grok** | Single PWA stand-in |
| **obs** | Heavy creative / multi-surface |

## Next session — ordered work

### 1. Update the harness

| Change | Detail |
| --- | --- |
| Samples default **5** | Not 10 |
| Core app list | Five above |
| Trial model | Sticky window for non-open ops; open_fresh open→settle→close; **no open_warm pile-up** |
| Per-app write | Survive sleep/crash |
| **Sleep inhibit in prep** | Restore in cleanup (FIRM) |
| Thrash criteria | Settle fail, excess hard resets, or wait ≫ settleDuration — record **last-good** + **first-fail** |
| WS rules | Test desk mid-run; WS1 only at finished cleanup |
| Never close Guake | Operator chat |

### 2. Multi-op maneuvers

**Goal:** minimum inter-step delay that stays thrash-free (hard-stable), not just agreement floors.

#### 2a — Two-step (first)

| Id | Shape |
| --- | --- |
| `launch_then_move` | open → delay **D** → move_resize → settle |
| `launch_then_monitor` | open → delay **D** → move_to_monitor → settle |

**Sweep:** start **high** D (padded, thrashless) → step **down** until thrash → record **last-good D** and **first-fail D** per app×maneuver.

#### 2b — Hypothesize 3-step delays

From 2a last-good values, form **padded** starting hypotheses:

- **D₁** (after open, before monitor) — start **above** launch→monitor last-good (pad; do not start at the thrash edge)
- **D₂** (after monitor, before move) — start **above** launch→move last-good (pad)

Pad so the first 3-step runs are expected thrashless, then search down.

#### 2c — Three-step isolation sweep (`launch_monitor_move`)

Shape: `open → D₁ → move_to_monitor → D₂ → move_resize → settle`

**Procedure (FIRM for harness):**

1. **Pad** D₁⁰, D₂⁰ from 2b (conservative). Confirm thrashless at (D₁⁰, D₂⁰).  
2. **Lock D₁ = D₁⁰.** Decrease **D₂ only** until thrash → record last-good D₂*, first-fail D₂.  
3. **Reset D₂** to a safe padded value (e.g. D₂⁰ or last-good+pad).  
4. **Lock D₂** at that safe value. Decrease **D₁ only** until thrash → record last-good D₁*, first-fail D₁.  
5. **Joint near-edge:** start near (D₁*, D₂*) with small pad; try to move both as close to their thrash points as possible without thrash (coordinate descent / grid near corner — harness may do small joint steps).  
6. **Compare** smallest thrashless pair **(D₁†, D₂†)** to the **2b hypothesis** (padded single-step last-goods). Record ratio / error for host “speed” later.

**Why isolation then joint:** each axis thrash point is measurable without confounding; joint step checks interaction (monitor churn + resize).

**Host speed metric (later):** at Forge load / prep, record a cheap host factor (e.g. derived settle knobs, or a fixed micro-benchmark). Scale delay tables across black/gray/green from thrash edges + that metric.

### 3. Ghostty pilot

```text
prep (probe on, Forge off, sleep inhibit)
→ bootstrap + calibrate
→ full 5× (single-ops subset + 2-step sweeps; 3-step if ready)
→ cleanup (Forge on, sleep restore, WS1)
```

### 4. Adjust → rest of core apps

- Small fixes → nautilus, grok, inkscape, obs  
- Large harness churn → re-run **all five** including ghostty  

## Agent commands (after harness lands)

```bash
cd /home/luke/dev/me/forge
git checkout task/meta-probe-harness
cd tests/meta-probe
python3 -m unittest test_ext_state test_settle test_results -q
python3 probe_driver.py prep --host black
python3 probe_driver.py run --host black --suite full-suite --samples 5 --apps ghostty
python3 analyze.py results/black/wayland/full-suite/latest.json
python3 probe_driver.py cleanup
```

## Pre-session checklist (operator / agent)

| Step | Who |
| --- | --- |
| On branch `task/meta-probe-harness`, pull latest | agent |
| Wayland session; Guake OK on WS1; test desk free (index 3) | human |
| Probe loads (`probe_driver.py ping`) | agent |
| Prep enables sleep inhibit + probe; disables Forge | agent |
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
e.g. `black/wayland/full-suite/` (gitignored data)

## Later

- X11; gray/green hosts  
- Layout engine rewrite from thrash-free inter-op delays  
- Host speed metric × delay tables  
