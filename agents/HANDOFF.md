# Handoff — forge (lukebmay)

**Updated:** 2026-08-10 (**D022** nest isolation locked; **P0 = N3→N1→N4→N2**; P1 Wayland RC)  
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
| Wayland retest | `forge nested restart` (not logout loop) when extension JS changed |
| Nest purpose (D022) | Code/test loop only (avoid logout); no-code smokes on **host** |
| Nest mon count | **Default 1.** `--monitors=N` only when testing multi-mon behavior |
| Nest mon size | Default size policy may shrink later; dual: each dummy ≈ primary logical historically |
| Nest after tests | **FIRM** stop — after N3: mechanical auto-cleanup on campaign entry |
| Nest isolation v1 | Data root + `FORGE_HOST=…-sub-…`; **no** UNIX test user; escalate only if still taints |

### Why patches are bad (still FIRM)

Name the phase that failed → fix that contract → delete crutches. See [REGRESSIONS.md](./REGRESSIONS.md) and [project.md](./project.md) § Layout apply architecture.

Lifecycle: prefer **owned bags** (sources/signals/lifetime/attach) so disable/destroy cannot forget cleanup — not another one-off timer field.

---

## Start here (next agent)

| Pri | Work | Path |
| --- | --- | --- |
| **P0-1** | **N3** nest auto stop/cleanup (`run` or exec always-stop) | [task](./tasks/forge-nested-isolation_n3-auto-cleanup.md) |
| **P0-2** | **N1** nest `FORGE_HOST` + CLI config/state roots | [task](./tasks/forge-nested-isolation_n1-data-root.md) |
| **P0-3** | **N4** docs (testing.md, RC suite) to match D022 | [task](./tasks/forge-nested-isolation_n4-docs.md) |
| **P0-4** | **N2** extension/Shell data root (no parent `~/.config/forge` writes) | [task](./tasks/forge-nested-isolation_n2-extension-root.md) |
| **P1** | Wayland RC — host L1/`_forge-test-*` first; nest mon=1 unless multi-mon case | [suite](./plans/forge-wayland-rc-test-suite.md) |
| optional | Per-window signals → WindowAttach | [plan](./plans/forge-lifecycle-abstractions.md) |
| done | D022 + D0 nest isolation design | [completed](./tasks/completed/forge-nested-isolation_d0-discussion.md) |
| done | Lifecycle W1–W5 + L8/L11; R011; R012 | [REGRESSIONS](./REGRESSIONS.md) |

### Plan map

| Plan | Role |
| --- | --- |
| [forge-nested-isolation.md](./plans/forge-nested-isolation.md) | **P0** implement order + acceptance |
| [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) | P1 RC procedure |
| [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md) | Health plan (scope complete) |

### P0 — Nest isolation (implement)

**Do N3 first**, then N1, N4 (docs can ship with N3), then N2.

| Slice | Goal |
| --- | --- |
| N3 | Campaign entry always cleans nest; stale reaper |
| N1 | `FORGE_HOST=<host>-sub-<name>` + nest CLI data dirs; shared layout profiles OK |
| N4 | testing.md / RC suite process rules |
| N2 | Nest Shell/extension honor same data root |

**Until N1/N2 land:** nest CLI may still touch parent heuristics — prefer ghostty structure smokes; avoid long nest settle campaigns on parent config; always `forge nested stop`.

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
forge nested stop
forge nested status   # want: running: False
```

Prefer `forge nested exec -- …` (and after N3: campaign `run` that always stops).  
**Never** leave nest env on durable agent shells.  
**Default** `forge nested start` → 1 mon. Dual only: `--monitors=2` when testing dual-mon behavior.

### Headless / true cold

Durable Grok leader (or Guake/float). After suites that close agent TILE: leader reopens ghostty; `grok -r`.

```bash
forge test live probe
# L0 before expensive live
python3 -m pytest tests/unit/cli/test_layout_apply.py tests/unit/cli/test_live_matrix.py -q
```

### Nested Wayland (process)

```bash
# Code changed → retest without logout:
./install && forge nested restart          # mon=1 default
# Multi-mon behavior under test only:
forge nested start --monitors=2 --replace
forge nested exec -- forge ping
forge nested stop                          # FIRM until N3 auto
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
