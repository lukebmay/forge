# Handoff — forge (lukebmay)

**Updated:** 2026-08-10 (**nest isolation v1 done** N3→N1→N4→N2; **P1 = Wayland RC**)  
**Branch:** **`master`** (default).  
**Sessions:** **Wayland** daily driver; nest for **code→reload** loops only (default **1 mon**).  
**Agent terminal:** Durable **Grok leader** for true cold (closes agent TILE). Guake/float also OK.  
**Jobs (shipped):** Mutating `forge` durable by default.  
**Layouts for tests:** only **`_forge-test-*`** — never personal `dev` / `t1` in matrix.  
**Nest design:** [D022](../docs/DECISIONS.md) · [plan](./plans/forge-nested-isolation.md) · [D0](./tasks/completed/forge-nested-isolation_d0-discussion.md).

**Default:** fix the **real problem** (ownership, contracts, pure reuse). Temporary only if operator **explicitly** asks.  
**Lens (FIRM):** **Size is a symptom, not the disease.** Prefer healthy abstractions and tests over “make the file smaller.”

---

## Architecture lock (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Cold spine | `skeleton → open → bind → order/size → hard-ready → focus once → soft residual → verify once` |
| Soft residual (D019) | **Product** — Meta has no settle ACK; learned quiet + correct-on-miss. Not a bug class. |
| Mode B as cold success | **Forbidden** — Mode B = true mid-session chaos only |
| Belt after bind | **Moves-only** (D014) — no structure rewrite on happy path |
| Profiles | Data only — no personal-layout product branches |
| Focus | Post-settle phase; open-leaf pin on steal (D018) |
| Unfocus key (`Ctrl+Super+Esc`) | **Abandoned** — not product; keybind unbound |
| Close → focus | **Kept** (FC1) — LFT/sibling restore |
| CLI jobs | Durable mutators (D021) |
| Wayland retest | Prefer `forge nested run` (or `restart`+stop); never logout loops for JS |
| Nest purpose (D022) | Code/test loop only (avoid logout); no-code smokes on **host** |
| Nest mon count | **Default 1.** `--monitors=N` only when testing multi-mon behavior |
| Nest mon size | Default size policy may shrink later; dual: each dummy ≈ primary logical historically |
| Nest after tests | **FIRM** — prefer `forge nested run` (always stops); interactive → `stop` |
| Nest isolation v1 | `FORGE_HOST=…-sub-…` + `FORGE_CONFIG_HOME` on CLI **and** nest Shell (N1/N2); extension `forgeConfigHome()`; shared layout profiles + install UUID OK; **no** UNIX test user |

### Why patches are bad (still FIRM)

Name the phase that failed → fix that contract → delete crutches. See [REGRESSIONS.md](./REGRESSIONS.md) and [project.md](./project.md) § Layout apply architecture.

Lifecycle: prefer **owned bags** (sources/signals/lifetime/attach) so disable/destroy cannot forget cleanup — not another one-off timer field.

---

## Start here (next agent)

| Pri | Work | Path |
| --- | --- | --- |
| **P1** | Wayland RC — host L1/`_forge-test-*` first; nest mon=1 unless multi-mon case | [suite](./plans/forge-wayland-rc-test-suite.md) |
| optional | Per-window signals → WindowAttach | [plan](./plans/forge-lifecycle-abstractions.md) |
| done | Nest isolation **N3→N1→N4→N2** (D022 v1) | [plan](./plans/forge-nested-isolation.md) · [completed/](./plans/forge-nested-isolation/completed/) |
| done | D022 + D0 nest isolation design | [completed](./tasks/completed/forge-nested-isolation_d0-discussion.md) |
| done | Lifecycle W1–W5 + L8/L11; R011; R012 | [REGRESSIONS](./REGRESSIONS.md) |

### Plan map

| Plan | Role |
| --- | --- |
| [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) | **P1** RC procedure |
| [forge-nested-isolation.md](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md) | Health plan (scope complete) |

### Nest isolation v1 (shipped)

| Slice | Goal | Status |
| --- | --- | --- |
| N3 | Campaign entry always cleans nest; stale reaper | done |
| N1 | `FORGE_HOST=<host>-sub-<name>` + nest CLI data dirs; shared layout profiles OK | done |
| N4 | testing.md / RC suite / HANDOFF process rules | done |
| N2 | Nest Shell/extension honor same data root (`forgeConfigHome`) | done |

**CLI + nest Shell:** `FORGE_HOST` / `FORGE_CONFIG_HOME`; extension writes under nest
`…/forge-config`, not parent `~/.config/forge`. Prefer `forge nested run` for campaigns.
Shared intentionally: install UUID, layout profiles, gsettings.

### P1 — Wayland RC prep (next campaign)

Procedure: [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) ·
process: [testing.md](./testing.md) § Wayland.

| Rule | Detail |
| --- | --- |
| Host first | L1 / dual-mon open-leaf / chrome RC authority on **host** desk |
| Layouts | **`_forge-test-*` only** — never personal `dev` / `t1` |
| Nest | Code→reload or multi-mon structure only; default **mon=1** |
| Campaign entry | `forge nested run -- …` (always stops); dual: `--monitors=2` only when needed |
| Isolation | Nest CLI+Shell use nest `forge-config`; parent `~/.config/forge` not rewritten |
| Results | `agents/test-results/wayland/<host>-wayland-<UTC>.json` |
| Wrap-up | `forge nested status` → `running: False` |

```bash
echo "$XDG_SESSION_TYPE"          # wayland
forge test live probe             # can_nested / can_retest
# L0
python3 -m pytest tests/unit/cli/test_layout_apply.py \
  tests/unit/cli/test_live_matrix.py tests/unit/cli/test_nested_wayland.py -q
# Host L1 / partial (no nest if no JS change)
forge test live plan --from-work wayland-rc
# After extension JS change: ./install && forge nested run -- …
# Host dual-mon RC needs tip already on host (one logout after install if needed)
```

**Host tip note:** nest can load tip via `./install` + nest restart without host logout;
host Shell still needs logout/reload once if host RC must exercise new extension JS.

### Lifecycle bags (shipped — residual optional)

| Module | Path | Status |
| --- | --- | --- |
| SourceBag | `lib/extension/sources.js` | live |
| settle-math | `lib/extension/settle-math.js` | live |
| SignalBag | `lib/extension/signals.js` | live + W5 |
| Lifetime | `lib/extension/lifetime.js` | pure compose |
| SuppressFlag | `lib/extension/suppress.js` | live W4 |
| WindowAttach | `lib/extension/window-attach.js` | live W2 |
| OpenCommitManager | `lib/extension/open-commit-manager.js` | L8 |
| LayoutBatchDepth | `lib/extension/layout-batch-depth.js` | L11 |

**Failure dump:** `wm._wmSources|._wmSignals|._openCommit|._windowAttach|._layoutBatch|._suppress*.snapshot()`

### Nest lifecycle — STOP after tests (FIRM)

```bash
# Prefer campaign entry (always stops unless --keep):
forge nested run -- forge ping
forge nested status   # want: running: False

# Interactive multi-step still ends with:
forge nested stop
forge nested status   # want: running: False
```

**Prefer** `forge nested run -- …` for one-shot campaigns.  
Use `exec` / `restart` only when the nest must stay up for multi-step work; **still stop** when done.  
**Never** leave nest env on durable agent shells.  
**Default** mon=1. Dual only: `--monitors=2` when testing dual-mon behavior.  
Nest client + Shell env: `FORGE_HOST=…-sub-…`, `FORGE_CONFIG_HOME=<session>/forge-config` (N1/N2).

### Headless / true cold

Durable Grok leader (or Guake/float). After suites that close agent TILE: leader reopens ghostty; `grok -r`.

```bash
forge test live probe
# L0 before expensive live
python3 -m pytest tests/unit/cli/test_layout_apply.py tests/unit/cli/test_live_matrix.py -q
```

### Nested Wayland (process)

```bash
# Code changed → one-shot retest without logout (preferred):
./install && forge nested run -- forge ping          # mon=1; auto stop
# Multi-mon behavior under test only:
forge nested run --monitors=2 -- forge tree
# Multi-step interactive:
./install && forge nested restart
forge nested exec -- forge ping
forge nested stop                                   # FIRM
```

No-code smoke → **host** only (no nest).

---

## Abandoned / do not revive

| Item | Note |
| --- | --- |
| Unfocus key `Ctrl+Super+Esc` | Abandoned; unbound |
| Mode B as cold success | Forbidden |
| Personal layouts in live matrix | Use `_forge-test-*` only |
| Separate UNIX nest user (v1) | Rejected until data-root isolation fails |

---

## Doc map

| Doc | Role |
| --- | --- |
| [PRIORITY.md](./PRIORITY.md) | Queue |
| [nest isolation](./plans/forge-nested-isolation.md) | **P0** |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | P1 |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | Health (done scope) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft product |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
