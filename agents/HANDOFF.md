# Handoff — forge (lukebmay)

**Updated:** 2026-08-11 (**R017** scale/entered-monitor thrash fix in tree; R016 shipped)  
**Branch:** **`master`** (default).  
**Sessions:** **Wayland** daily driver; nest for **code→reload** loops only (default **1 mon**).  
**Agent terminal:** Durable **Grok leader** for true cold (closes agent TILE). Guake/float also OK.  
**Jobs (shipped):** Mutating `forge` durable by default.  
**Layouts for tests:** only **`_forge-test-*`** — never personal `dev` / `t1` in matrix.  
**Nest design:** [D022](../docs/DECISIONS.md) · [plan](./plans/forge-nested-isolation.md) · [D0](./tasks/completed/forge-nested-isolation_d0-discussion.md).  
**Last RC:** [forge-wayland-rc_r013-r014](./plans/forge-wayland-rc-test-suite/completed/forge-wayland-rc_r013-r014.md) · tip needs `./install` (+ nest or logout) for R016/**R017** JS.

**Default:** fix the **real problem** (ownership, contracts, pure reuse). Temporary only if operator **explicitly** asks.  
**Lens (FIRM):** **Size is a symptom, not the disease.** Prefer healthy abstractions and tests over “make the file smaller.”

### Shipped — R017 (scale/geom → no entered-monitor thrash)

| Field | Detail |
| --- | --- |
| Task | [completed](./tasks/completed/forge-gdisplays-scale-change-thrash.md) |
| Behavior | Geom drift suppress; **defer** entered-monitor rehome; monitors-changed arms settle; no quiet-fp poison; settle R016 retile |
| Code | `workareasGeometryEqual`, `displayGeometryChangedFromQuiet`, deferred rehome, monitors-changed queue |
| Guards | L0 `bug-r017-…` (48 tests w/ R016/H1/R012); live note `--tags R017` |
| Residual | **Logout once** after latest install to load tip (classify same-count→retile). Nest: both scale dirs log `workareas-retile`. Host reverse thrash was H1+stale frames. Restore: `gdisplays load default && forge layout dev` |

### Shipped — R016 (display settle / no-op thrash)

| Field | Detail |
| --- | --- |
| Task | [completed](./tasks/completed/forge-monitor-noop-apply-thrash.md) |
| Behavior | **L0** fingerprint+homes no-op; **L1** retile; **mon loss** collect-to-end-as-group; **mon gain** empty; chaos → H1 |
| Code | `workareas-policy.js` + `monitor-recovery.js` graduated settle |
| Guards | L0 `workareas-policy` + `bug-r016-noop-workareas-no-thrash`; live `--tags R016` |
| Residual | Automated ApplyMonitorsConfig inject not in harness; manual gdisplays smoke |
| Related | Cross-mon tabs D0: [forge-tab-groups-cross-mon_d0-discussion](./tasks/forge-tab-groups-cross-mon_d0-discussion.md) |

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
| **next** | Load tip (R016/R017 JS) + L1 scale smoke: `gdisplays load default-no-scale` must not thrash; restore default | [PRIORITY](./PRIORITY.md) · [R017](./REGRESSIONS.md) · [task](./tasks/completed/forge-gdisplays-scale-change-thrash.md) |
| later | Cross-mon TABBED product design (D0) | [task](./tasks/forge-tab-groups-cross-mon_d0-discussion.md) |
| done | **R017** entered-monitor suppress on geom drift | [completed](./tasks/completed/forge-gdisplays-scale-change-thrash.md) |
| done | **R016** no-op workareas + mon-loss collect | [completed](./tasks/completed/forge-monitor-noop-apply-thrash.md) |
| done | **R015** empty-mon DnD (grab-end rehome when no TILE under pointer) | L0 `bug-r015-empty-mon-dnd`; live `L1.r015-empty-mon-dnd` |
| done | Wayland RC R013/R014 + host logout + suite green | [completed](./plans/forge-wayland-rc-test-suite/completed/forge-wayland-rc_r013-r014.md) |
| done | Nest isolation **N3→N1→N4→N2** (D022 v1) | [plan](./plans/forge-nested-isolation.md) · [completed/](./plans/forge-nested-isolation/completed/) |
| done | Lifecycle W1–W5 + L8/L11; R011; R012 | [REGRESSIONS](./REGRESSIONS.md) |

### Plan map

| Plan | Role |
| --- | --- |
| [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) | RC procedure (last run green) |
| [forge-nested-isolation.md](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md) | Health plan (scope complete; optional residual) |

### R015 (empty-mon drag) — shipped in tree

**Symptom:** dual-mon Wayland; two dock windows on left; click-drag one to empty
right mon → snaps back on release. Keyboard mon-move works.

**Root:** DnD only commits with `nodeWinAtPointer`. R012 skips mid-drag rehome.
Empty dest → null target → grab-end no-op → render snaps back.

**Fix:** `resolveEmptyMonitorDrop` + `_commitEmptyMonitorDrop` in
`lib/extension/drag-drop.js`; session `dnd-drop` accepts `destMonitor` without
`onto`; live case `L1.r015-empty-mon-dnd`.

```bash
# L0
npm test -- tests/regression/bug-r015-empty-mon-dnd.test.js
python3 -m pytest tests/unit/cli/test_live_matrix.py -q -k r015
# Load tip + dual-mon live (Wayland):
./install && forge nested run --monitors=2 -- forge test live run --tags R015
# Or host after one logout loads tip: human drag mon0 TILE onto empty mon1
```

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

### Wayland RC (cleared 2026-08-10)

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

**Last host run:** tip `…-dirty` after logout; full `wayland-rc` cleared (first
`L1.ghosttys-only` post-login hard-ready fluke; retest PASS). R013/R014 open-leaf
thrash **not** reproduced.

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
| [nest isolation](./plans/forge-nested-isolation.md) | Nest isolation v1 (**done**) |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | RC procedure (cleared) |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | Health (done scope) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft product |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
