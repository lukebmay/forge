# Session handoff — Meta probe full matrix (next session)

**Date prepared:** 2026-08-07  
**Branch:** `task/meta-probe-harness`  
**Host:** `black` (later `gray`, `green`)  
**Path:** `tests/meta-probe/`  
**Session type:** Wayland (do not mix with X11 results)

## Status

| Item | State |
| --- | --- |
| Pilot (nautilus, ghostty, inkscape, gnome-terminal) n=2 | **Green** — see results below |
| Prep Forge-disable bug | **Fixed** (Enabled/State parsing + retries + preflight) |
| Full science matrix n=10 | **Ready** — not started (this handoff) |

## Human (only)

1. Stay out of OS/window manipulation during agent runs  
2. Leave **Guake on WS1**; leave **test workspace empty** (driver uses index `preferIndex` default **3**)  
3. Tell agent: **start full matrix** / **probe ready**  
4. Do **not** manually enable/disable extensions unless prep fails  

## Agent start (new session)

```bash
cd /home/luke/dev/me/forge
git checkout task/meta-probe-harness
cd tests/meta-probe

# Prep: symlink probe, disable forge+rivals (reliable), enable probe, preflight
python3 probe_driver.py prep --host black

# Optional unit guard
python3 -m unittest test_ext_state test_settle -v

# Full matrix (long). Prefer one continuous run so results stay one doc:
python3 probe_driver.py run --host black --samples 10

# If token budget is tight, run app groups and stop cleanly between groups:
# python3 probe_driver.py run --host black --samples 10 --apps nautilus,ghostty,inkscape,gnome-terminal
# python3 probe_driver.py run --host black --samples 10 --apps google-chrome,google-chrome-amazon,firefox
# python3 probe_driver.py run --host black --samples 10 --apps grok,youtube,gmail,google-voice
# python3 probe_driver.py run --host black --samples 10 --apps code,gimp,kdenlive,obs,steam,slack
# Skip guake unless operator moves agent off Guake

python3 analyze.py results/latest.json
```

### After testing (FIRM)

```bash
# cleanup focuses WS1 (index 0), disables probe, restores Forge/rivals
python3 probe_driver.py cleanup

# If cleanup cannot run but probe is still up:
python3 probe_driver.py focus-workspace 0
```

**Human signal that the agent finished:** active workspace is **WS1** (index 0), where Guake is.

## Workspace map (FIRM)

| 0-based index | Human | Use |
| --- | --- | --- |
| **0** | **WS1** | Operator / Guake — **return here when done** |
| 3 | (default test) | Empty measurement desk (`config.workspace.preferIndex`) |

`cleanup.sh` always `FocusWorkspace(returnIndex)` **before** disabling the probe (`returnIndex` default 0).

## Full suite apps (tag `full`)

| Group | Apps | Notes |
| --- | --- | --- |
| Pilot | nautilus, ghostty, inkscape | Already green at n=2 |
| Terminal | gnome-terminal | Green at n=2; **skip guake** while agent is in Guake |
| Chrome | google-chrome, google-chrome-amazon | heavy URL |
| PWAs | grok, youtube, gmail, google-voice | |
| Browsers | firefox | |
| Electron | code, slack | skip-if-missing OK |
| Creative | gimp, kdenlive, obs | skip-if-missing OK |
| Games | steam | skip-if-missing OK |

Missing binaries with `skip-if-missing` are skipped, not hard-failed.

## Settle (do not speed up)

quietMs=500 · agreementIntervalMs=2000 · agreeCount=5 · dense samples 0–4 / sparse 5–9  

~10s min settle when already quiet × 14 ops × 10 samples ≈ long wall clock per app (~20–30+ min/app order of magnitude). Budget time; prefer continuous `run` until budget/problem.

## Prep bug (fixed) — do not regress

| Wrong | Right |
| --- | --- |
| Match `State:.*enabled` only | Prefer `Enabled: Yes/No`, then `State: ACTIVE/INACTIVE` |
| Trust preflight when CLI always said disabled | `extension_enabled` + probe `enabledExtensions` + list `--enabled` |
| One-shot disable | prep retries disable; dies if Forge still on |

Code: `lib/ext_state.py`, `prep.sh`, `probe_driver.extension_enabled`, `test_ext_state.py`.

## Prior pilot results (2026-08-07 black Wayland)

| Run | Result |
| --- | --- |
| pilot stage1 nautilus n=2 × 14 ops | 28/28 ok |
| pilot stage2 ghostty n=2 × 14 ops | 28/28 ok |
| pilot stage3 inkscape n=2 × 14 ops | 28/28 ok |
| run gnome-terminal n=2 × 14 ops | 28/28 ok |

Artifacts: `tests/meta-probe/results/run-black-*.json`

## Orchestrator notes (full matrix session)

1. One task: collect as many full-matrix samples as budget allows  
2. On significant failure (prep die, preflight fail, shell crash, repeated settle timeout): **stop**, focus WS1, write note — do not thrash  
3. Do not open guake as a target app while the agent is inside Guake  
4. No push unless asked; no SSH without **explicit**  
5. Do not wire probe into Forge layout engine yet  
6. End: `cleanup` (restores Forge + **WS1**)  

## FIRM

- No push unless asked  
- No SSH without **explicit** in user message  
- Do not wire probe into Forge layout engine yet  
- **Always return to WS1 (index 0) when testing ends**  
