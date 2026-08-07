# Task: Meta probe harness reshape + multi-op thrash sweeps

**Status:** done (code) — live ghostty pilot next  
**Branch:** `task/meta-probe-harness`  
**Plan:** (standalone — measurement campaign; see PRIORITY #1)  
**Handoff:** [tests/meta-probe/SESSION_HANDOFF.md](../../tests/meta-probe/SESSION_HANDOFF.md)

## Goal

Update the Meta probe harness for the core-app thrash campaign: 5 samples, five core apps, sticky trial model, sleep inhibit, per-app durable writes, thrash criteria with last-good/first-fail, then 2-step and isolated 3-step multi-op delay sweeps.

## Acceptance

### Harness defaults / apps

- [x] Default samples **5** (config + CLI help + README)
- [x] Default full-suite apps = **core only**: nautilus, ghostty, inkscape, grok, obs (tag `core`)
- [x] Other apps remain in `apps.json` but not selected by default

### Trial model

- [x] Non-open ops: **sticky** single window per app (open once, reuse)
- [x] `open_fresh`: open → settle → **close** each sample (no pile-up)
- [x] **No `open_warm`** in default full-suite ops (opt-in via `--ops`)
- [x] Never close Guake

### Durability / sleep

- [x] **Per-app write** (atomic checkpoint) so sleep/crash does not lose prior apps
- [x] **Sleep inhibit in prep**, restore in **cleanup** (FIRM)
- [x] WS: test desk mid-run; **WS1 only** at finished cleanup

### Thrash + multi-op

- [x] Thrash criteria: settle fail, excess hard resets, and/or wait ≫ settleDuration — record **last-good** + **first-fail**
- [x] Two-step maneuvers: `launch_then_move`, `launch_then_monitor` with delay **D** sweep
- [x] Three-step: `launch_monitor_move` with isolation sweep per SESSION_HANDOFF §2c
- [x] Unit tests for pure thrash/sweep helpers; existing unit tests still pass

### Out of scope this task

- Live ghostty pilot / full matrix on black (orchestrator runs after code AGREE; no A/B for pure testing)
- Wiring probe into Forge layout engine

## Session note

**2026-08-07 — code ship (A/B AGREE, wrap-up):**

Harness reshape landed on `task/meta-probe-harness`: samples=5, core apps tag, sticky/open_fresh trial model, open_warm opt-in only, per-app atomic checkpoints, systemd-inhibit prep/cleanup, thrash + 2/3-step `sweep` CLI. Unit tests **48 OK**. B one-liner: skipped trials not marked thrash.

**Live next (no A/B):** prep → ghostty single-ops 5× → 2-step sweeps → optional 3-step → cleanup.

```bash
cd tests/meta-probe
python3 probe_driver.py prep --host black
python3 probe_driver.py run --host black --suite full-suite --apps ghostty --samples 5
python3 probe_driver.py sweep --host black --apps ghostty --maneuver launch_then_move --d-start 2000 --d-step 100
python3 probe_driver.py cleanup
```
