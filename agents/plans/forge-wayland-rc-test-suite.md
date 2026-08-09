# Wayland RC test suite (duplicable)

**Status:** active — first full run on host `black` 2026-08-09  
**Purpose:** Repeatable dual-mon Wayland smoke for a **release candidate**, with
metrics comparable across machines (e.g. older host).  
**Session:** Wayland login (daily driver). Extension retest via **`forge nested`**,
not logout loops.

Related: [testing.md § Wayland](../testing.md), [HANDOFF smoke loop](../HANDOFF.md#wayland-extensive-smoke-loop),
[AI live matrix](./forge-ai-live-test-matrix.md), [CT2](../tasks/forge-layout-cold-topology_ct2-wayland-live.md).

---

## What this suite proves

| Layer | Proves | Where |
| --- | --- | --- |
| **L0** | Pure/contract (plan, apply, settle, jobs, live select) | `pytest` / vitest |
| **Nest single (A)** | Extension loads; Forge DBus; `forge ping` after restart | Nested Shell window |
| **Nest dual (A2)** | Dummy dual mon + layout across mon0/mon1 | `forge nested start --monitors=2` |
| **Host L1 (B)** | Physical dual 4K partial reload, open leaf, multi-instance, focus | **Host** desk |
| **Host L2** | True cold + clean | Host + Guake/float **or durable Grok leader** |
| **CT2 / near-cold** | One-shot layout from sparse desk | Host or nest dual |

**Profiles:** only `_forge-test-*` (not personal `dev` / `t1`).

---

## Preconditions (any host)

```bash
# Session + tools
echo "$XDG_SESSION_TYPE"          # want: wayland
forge ping                        # host Forge ok
forge test live probe             # can_nested=true can_retest=true
forge nested doctor               # tools ok
gdisplays --status                # dual mon expected for full L1

# Logging (debug install)
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 4

# Profiles (host layout tree; black dual-mon set under shellrc)
forge layout list
# want at least: dev, t1, clean, ghosttys
```

| Profile | Role in suite |
| --- | --- |
| `_forge-test-dual` | Dual-mon open-leaf desk (chrome/Grok + ghostty \| ghostty + YT/Gmail) |
| `_forge-test-nautilus` | Dual-mon with nautilus vsplit (replaces personal `t1`) |
| `_forge-test-ghosttys` | Dual mon multi-instance same-class (ghostty\|ghostty) |
| `_forge-test-clean` | Empty tiles (closes residuals) |
| `_forge-test-nest-dual` | Nest-friendly: mon0 ghostty\|nautilus ; mon1 ghostty |

These live under `layout/common/` and `layout/hosts/<host>/`. **Do not** use
personal `dev` / `t1` for matrix cases.

---

## Suite catalog (run order)

### Phase 0 — L0 (always first)

```bash
python3 -m pytest tests/unit/cli/test_live_matrix.py tests/unit/cli/test_layout_apply.py \
  tests/unit/cli/test_layout_plan.py tests/unit/cli/test_settle_heuristics.py \
  tests/unit/cli/test_job_runner.py tests/unit/cli/test_nested_wayland.py -q
# optional broader:
# npm test   # or make unit-test when extension JS touched
```

### Phase 1 — Nest retest harness

```bash
./install                         # tip on disk
# Single-mon nest (extension reload smoke):
forge nested start                # or restart if already up
# Dual-mon nest (multi-mon layout smoke without host desk):
forge nested start --monitors=2 --replace   # mon size = host primary logical default
# throwaway shell only (never durable agent shell):
eval $(forge nested env --export) && forge ping
forge tree   # expect mo0ws0 + mo1ws0 stableKeys side-by-side when --monitors=2
forge layout _forge-test-ghosttys
forge nested restart --monitors=2
# … more nest cases …
forge nested stop                 # FIRM when nest phase ends
forge nested status               # running: False
# do NOT export nest into host dual-mon shell
```

**FIRM — stop nest after tests:** Every nest campaign ends with
`forge nested stop` (and status check). Do not leave subshells running across
host matrix, wrap-up, or handoff. See [testing.md](../testing.md) nest stop
rules and [HANDOFF](../HANDOFF.md#nest-lifecycle--stop-after-tests-firm).

**Proven on black:** `forge nested start --monitors=2` → two dummy outputs
(each ≈ host primary logical size) → layout `_forge-test-ghosttys` → one
ghostty per mon.

### Phase 2 — Host L1 (X11 parity partial matrix + multi-instance)

Ghostty-safe; **never close agent Ghostty**.

```bash
# Plan what will run:
forge test live plan --suite partial
forge test live plan --from-work wayland-rc   # RC-oriented behavior set

# Execute (writes metrics report under agents/test-results/wayland/):
forge test live run --suite partial
# or full RC selection:
forge test live run --from-work wayland-rc
```

| Case id | Pre-state | Profile / action | Must hold |
| --- | --- | --- | --- |
| `L1.ghosttys-only` | All chrome closed; ghostty tiles kept | `dev` | mon0 open leaf Grok; mon1 YouTube; agent survives |
| `L1.left-chrome` | mon1 chrome closed | `dev` | same open leaves; mon claim OK |
| `L1.right-ghostty` | mon0 chrome closed | `dev` | mon1 ghostty reused not stolen |
| `L1.t1-nautilus` | chrome closed + nautilus | `t1` | structure + agent |
| `L1.ghosttys-multi` | chrome closed | `ghosttys` | ghostty TILE on mon0 **and** mon1 |
| `L1.settled-rerun` | ensure-dev-shape | `dev` | open leaves; soft settle |
| `L1.close-focus-lft` | ensure-dev-shape | close disposable chrome | focus TILE; closed gone |
| `L1.unfocus` | ensure-dev-shape | unfocus | no TILE kbd focus; LFT retained |

Manual CT2-style (if not covered by cases):

```bash
# Near-cold: ghosttys only → one shot
# (or use L1.ghosttys-only)
forge layout dev
forge tree   # structure + open leaves
# Idempotent second run
forge layout dev   # moved≈0 when correct
```

### Phase 3 — Host L2 (optional; Guake / float agent)

```bash
forge test live probe   # need can_true_cold=true
forge test live run --suite cold
# Cases: L2.true-cold-dev, L2.layout-clean (R009)
```

With **tiled Ghostty agent**, L2 is **skipped by capability** (closing all tiles
would kill the agent window). Re-run L2 from Guake for full RC.

### Phase 4 — Nest-only smoke (after code change)

```bash
./install && forge nested restart
# nest health shell:
eval $(forge nested env --export) && forge ping
# host dual-mon: unset nest exports first, then re-run L1 subset
```

---

## Metrics & reports (cross-host compare)

Every `forge test live run` writes JSON (unless `FORGE_LIVE_REPORT=none`):

```text
agents/test-results/wayland/<hostname>-<session>-<UTC-stamp>.json
```

Or:

```bash
forge test live run --suite partial --report /tmp/wayland-rc-black.json
```

### Env namespace (`report.env`)

| Field | Meaning |
| --- | --- |
| `hostname` | Machine id (e.g. `black`, older host name) |
| `session` | `wayland` / `x11` |
| `agentTerminal` / `agentMode` | ghostty TILE vs guake FLOAT |
| `canNested` / `canRetest` / `canTrueCold` | Capability gates |
| `extensionVersion` | Host-loaded Forge version string |
| `nestedGnome` | Nest running at report time (bool/null) |

### Per-case metrics (`cases[].metrics`)

| Field | Meaning |
| --- | --- |
| `wallMs` | Subprocess wall time for `forge layout` |
| `counts.reused/opened/moved` | Plan counts from layout header |
| `thrashRisk` / `thrashState` / `thrashScore` | Plan thrash lines |
| `softTimeoutMs` | Learned soft quiet used for focus barrier |
| `softSettled` | Soft barrier ended clean |
| `softCorrections` | Focus-steal corrections during soft wait |
| `expectationMisses` | Residual events (= soft residual count) |
| `hardReadyWarnings` | Hard-ready timeout / warn hits in log |
| `hardReadyTimedOutMovingAnyway` | “moving anyway” residual noise count |
| `delayTimeoutsLikelyOk` | Soft quiet completed successfully (heuristic) |

### Summary (`metricsSummary`)

Roll-up: `wallMsTotal/Max/Avg`, `softTimeoutMsMax/Avg`,
`softCorrectionsTotal`, `expectationMissesTotal`, `hardReadyWarningsTotal`,
`delayTimeoutsLikelyOkTotal`.

**Compare older machine:** same suite + case ids; diff `metricsSummary` and
per-case `wallMs` / soft timeouts. Large soft floors or hard-ready timeouts on
the older host usually mean slower Meta/Chrome, not always a product bug.

---

## Pass criteria (RC bar)

1. **L0 green** for blast radius.  
2. **Nest:** start → ping → restart → ping.  
3. **L1:** all selected cases PASS; agent Ghostty `windowId` still in `forge tree`.  
4. **Open leaf:** mon0 Grok / mon1 YouTube after `dev` partials (R005/R007 class).  
5. **Multi-instance:** `L1.ghosttys-multi` dual mon ghostty.  
6. **No Mode B as cold success** (stderr thrash recover not required for pass).  
7. **L2** (if Guake): true cold + clean PASS.  
8. **Report** written with env namespace for archive.

---

## X11 parity note

Same L1 cases on X11 use `./install && killall -HUP gnome-shell` instead of nest.
Reports use `session: x11` so files do not collide with Wayland runs.

---

## Bugs found (2026-08-09 black)

| Id | Symptom | Status |
| --- | --- | --- |
| **R010** | One-shot multi-open / ghosttys-only: mon1 flat or mon0 thrash; Mode B second layout repairs | Partial fix (place→structure split; mon-ensure skip); first-shot still FAIL |
| Unfocus Wayland | RunSteps unfocus ok but Meta TILE remains focused | Tip JS: hand focus to FLOAT/Guake; **host must load tip** (logout once) |
| Nest die | Nested shell sometimes exits ~2s after enable | Investigate; first start/ping can still be green |
| Open-leaf false PASS | Ghostty title containing “grok” matched mon0 Grok check | Fixed: chrome-family required |

Record new failures under `agents/REGRESSIONS.md` + unit when pure + `LIVE_CASES`.  
Results JSON: `agents/test-results/wayland/`.

---

## Commands cheat sheet

```bash
forge test live probe
forge test live plan --suite partial
forge test live run --suite partial
forge test live run --from-work wayland-rc
forge test live run --cases L1.ghosttys-only,L1.ghosttys-multi
./install && forge nested restart
forge layout clean          # only with float agent / accept closing tiles
forge thrash heuristics
```
