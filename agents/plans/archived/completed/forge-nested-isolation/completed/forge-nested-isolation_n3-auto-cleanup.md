# forge-nested-isolation_n3-auto-cleanup — Nest auto stop + stale reaper

**Status:** done  
**Plan:** [forge-nested-isolation](../../forge-nested-isolation.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends on:** D022 (done)

## Goal

Nested campaigns must **never** leave orphan dbus/shell for the operator.
Auto-stop and cleanup are product behavior, not agent memory alone.

## Acceptance

- [x] `forge nested exec -- …` stops nest on process exit if this exec started
      the nest **or** document/clear policy: campaigns use a single entry that
      always stops (prefer: `forge nested run -- …` or exec with
      `--keep` opt-out)
- [x] On any normal/error exit path of the campaign entry: `status` →
      `running: False`; bus socket/pids cleaned (existing stop logic)
- [x] Stale pid/bus reaper: `stop` / `status` / `start --replace` recover when
      pid files lie
- [x] Units for policy helpers where pure; live smoke: start → exec true →
      status False (or run wrapper equivalent)
- [x] Agent docs point at auto-cleanup (N4 may finish prose) — one-line help on `run`; N4 owns full docs

## Context for the next agent

- Code: `scripts/forge/nested_wayland.py` — `run_campaign`, `should_stop_on_exit`,
  `has_stale_residue`, `reap_stale`, `stop`, `start`, `status_dict`
- **Campaign entry:** `forge nested run [--monitors=N] [--name=…] [--keep] -- <cmd…>`
  start if needed → client env → cmd → **always stop** (unless `--keep`)
- **`exec`:** still “nest must already be running”; no auto-start/stop (interactive)
- Reaper: `status` / `start` (when not running) call `reap_stale`; dead pids → not running
- Units: `tests/unit/cli/test_nested_wayland.py` (19 passed)
- N1/N2/N4 not done here

## Session note

**2026-08-10 N3 shipped (ready for review)**

**API:** `forge nested run [--monitors=1] [--name=forge] [--keep] -- <cmd…>`

**Code:**
- `should_stop_on_exit(always_stop, started_nest, keep)` — pure policy
- `has_stale_residue` / `reap_stale` — clean dead pids + leftover bus/socket
- `run_campaign` — ensure start → `exec_in` → `finally: stop` unless keep
- `status_dict` reaps stale; `start` reaps when not running; `exec` reaps then requires live
- CLI: `run` action + `--keep`; help one-liner

**Proven:**
```
python3 -m pytest tests/unit/cli/test_nested_wayland.py -q   # 19 passed
forge nested doctor   # can_nested: True (host Wayland)
forge nested stop || true
forge nested run -- true   # exit 0
forge nested status        # running: False, exit 1
forge nested stop || true  # not running
```

**Risks / follow-ups:** N4 docs (testing.md / HANDOFF FIRM `run`); N1 data-root isolation still open. Residue left none.
