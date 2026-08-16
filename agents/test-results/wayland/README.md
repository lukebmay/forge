# Wayland live test results

Reports are written by `forge test live run` (unless `FORGE_LIVE_REPORT=none`):

```text
agents/test-results/wayland/<hostname>-<session>-<UTC-stamp>.json
```

Suite procedure (duplicable on older machines):  
[`agents/plans/forge-wayland-rc-test-suite.md`](../../plans/forge-wayland-rc-test-suite.md)

## Compare fields

See suite doc § Metrics. Top-level `env` namespaces host/session/nest/capability.  
`metricsSummary` rolls up wall time, soft corrections, expectation misses, hard-ready warnings.

## 2026-08-10 host `black` (X11 partial — R011)

| Item | Value |
| --- | --- |
| Session | **X11** (HUP-capable; nest refused) |
| Extension | tip dirty lifecycle bags + **R011** CLI |
| Full auto live | **9/9 PASS** — `black-x11-20260810T173208Z.json` |
| softCorrections | **0** total (pre-R011 ghosttys-only/right-ghostty hit max 32) |
| Baseline (7/9) | `agents/test-results/x11/live-20260810-131353.json` |

**R011:** tab-join moves (`dest id:…`) stay in structure after TABBED wrap; mon-path moves remain place. Fixes first-shot open leaf on partial chrome reopen.

Wayland host dual-mon RC still next (need Wayland login + nest).

## 2026-08-09 host `black` (this campaign)

| Item | Value |
| --- | --- |
| Host | `black` dual 4K @ 1.5, Shell 46, **Wayland** |
| Host extension (runtime) | `v49-90-beta.2-279-g8c66092-dirty` (tip on disk newer; logout needed for host JS) |
| Nest tip | install tip; nest start flaky (shell exits ~2s after enable) — first ping green earlier |
| Agent | tiled Ghostty → `can_true_cold=false` (L2 skipped) |
| L0 | 417+ unit pytest green (live_matrix + layout + settle + jobs + nested) |

### L1 outcomes (host dual-mon)

| Case | Result | Notes |
| --- | --- | --- |
| `L1.ghosttys-only` | **FAIL** first-shot | R010: multi-open mon claim thrash; Mode B second layout repairs |
| `L1.left-chrome` | **PASS** after settled desk | softCorrections=0, wall~3.3s when mon0 shape good |
| `L1.right-ghostty` | flaky / FAIL after thrash cascade | depends on prior case desk |
| `L1.t1-nautilus` | **PASS** | |
| `L1.settled-rerun` | **PASS** | soft settle quiet |
| `L1.close-focus-lft` | **PASS** | FC3 close |
| `L1.unfocus` | **FAIL** on host tip | stage-only unfocus; Meta keeps TILE. Tip JS hands focus to FLOAT/Guake — needs host load |
| `L1.ghosttys-multi` | **PASS** | dual mon multi-instance ghostty |

### Product fixes landed this campaign

1. Live metrics + env-namespaced JSON reports  
2. Open-leaf check requires chrome-family (no Ghostty title false PASS on “Grok”)  
3. `ghosttys` layout + `L1.ghosttys-multi`  
4. Residual place→structure replan split (R010 partial)  
5. Skip mon-ensure when nested structure planned same pass  
6. Unfocus: prefer FLOAT/Guake Meta target (tip JS; host load pending)

### Nest multi-mon (proven 2026-08-09)

```bash
forge nested start --monitors=2 --replace   # mon size = 1920x1080 @ scale 1
eval $(forge nested env --export)   # throwaway shell only
forge ping                          # tip version on nest
forge layout _forge-test-ghosttys   # mon0 ghostty | mon1 ghostty
forge tree                          # mo0ws0 + mo1ws0 stableKeys
forge nested stop                   # FIRM after nest tests
forge nested status                 # running: False
```

Physical dual 4K host desk remains authority for full chrome open-leaf CT.
Nest dual is for extension+layout multi-mon without host logout.
Next: isolation strategies discussion
(`agents/tasks/forge-nested-isolation_d0-discussion.md`).

### Still open for RC

1. **R010 residual structure** (not soft-timeout): one-shot multi-open thrash if still seen after mitigations  
2. **Unfocus** host verification after logout loads tip (FLOAT handoff in JS)  
3. **Nest stability** under heavy host thrash (sometimes exits after GDM register)  
4. Soft residual thrash metrics high only when structure mid-fail — expected  

### Sample metrics (left-chrome isolated PASS)

```text
env.hostname=black session=wayland
wallMs≈3350 softTimeoutMs≈2000 softCorrections=0 expectationMisses=0
delayTimeoutsLikelyOk=1 hardReadyWarnings=0
```
