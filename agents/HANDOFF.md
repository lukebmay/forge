# Handoff — forge (lukebmay)

**Updated:** 2026-08-10 (**R012** GRAB_TILE mid-drag rehome skip; lifecycle **W1–W5 + L8/L11**; **R011**; Wayland RC next)  
**Branch:** **`master`** (default).  
**Sessions:** **Wayland** daily driver; nest dual-mon for RC without host logout.  
**Agent terminal:** Durable **Grok leader** for true cold (closes agent TILE). Guake/float also OK.  
**Jobs (shipped):** Mutating `forge` durable by default.  
**Layouts for tests:** only **`_forge-test-*`** — never personal `dev` / `t1` in matrix.  
**Wayland RC suite:** [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) · results `agents/test-results/wayland/` — **ready** (bags + R011 landed; resume on Wayland host).

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
| Wayland retest | `forge nested restart` (not logout loop); dual-mon nest: `--monitors=2` |
| Nest mon size | Each dummy mon = host **primary logical** size (not squeezed 2-in-1) |
| Nest after tests | **FIRM** `forge nested stop` — never leave subshells running |

### Why patches are bad (still FIRM)

Name the phase that failed → fix that contract → delete crutches. See [REGRESSIONS.md](./REGRESSIONS.md) and [project.md](./project.md) § Layout apply architecture.

Lifecycle: prefer **owned bags** (sources/signals/lifetime/attach) so disable/destroy cannot forget cleanup — not another one-off timer field.

---

## Start here (next agent)

| Pri | Work | Path |
| --- | --- | --- |
| **P0 now** | **Wayland nest dual-mon RC + host L1** (`_forge-test-*`) | [suite](./plans/forge-wayland-rc-test-suite.md) |
| optional | Per-window `windowSignals`/`actorSignals` → WindowAttach | [plan](./plans/forge-lifecycle-abstractions.md) |
| parked | Nest isolation discussion | [D0 nest](./tasks/forge-nested-isolation_d0-discussion.md) |
| later | STACKED product / resize-autotile | other plans — do not mix into cold spine |
| done | Pure L1–L6 + L4; wire **W1–W5**; **L8** OpenCommitManager; **L11** LayoutBatchDepth | [completed/](./plans/forge-lifecycle-abstractions/completed/) |
| done | **R011** tab-join moves stay in structure (X11 live 9/9) | [REGRESSIONS](./REGRESSIONS.md) · report `agents/test-results/wayland/black-x11-20260810T173208Z.json` |
| done | **R012** GRAB_TILE mid-drag rehome skip + live `L1.r012-cross-mon-tab-dnd` | [REGRESSIONS](./REGRESSIONS.md) · L0 unit + `forge test live plan --tags R012` |

### P0 — Lifecycle abstractions (plan scope complete)

**D0 locked.** Pure + primary wire + optional extracts **L8/L11 shipped**. Plan: [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md).

| Module | Path | Status |
| --- | --- | --- |
| SourceBag | `lib/extension/sources.js` | live; open-commit + `_wmSources` (12 slots) |
| settle-math | `lib/extension/settle-math.js` + CLI | golden JS↔Python |
| SignalBag | `lib/extension/signals.js` | pure + **W5** `wm._wmSignals` globals |
| Lifetime | `lib/extension/lifetime.js` | pure compose |
| SuppressFlag | `lib/extension/suppress.js` | pure + **W4** geom/above/rehome (**`.active`**) |
| WindowAttach | `lib/extension/window-attach.js` | pure + **W2** stack slot `"stack"` |
| OpenCommitManager | `lib/extension/open-commit-manager.js` | **L8** bag + pending; fire on WM |
| LayoutBatchDepth | `lib/extension/layout-batch-depth.js` | **L11** pure; `wm._layoutBatch` |

#### Wire already live

| Bag / flag | Label | Policy |
| --- | --- | --- |
| `wm._openCommit` / `._openCommitSources` | `open-commit` | manager cancelAll; inject schedule/cancel |
| `wm._wmSources` | `wm` | **12** slots; `_removeSignals` → `cancelAll` (no dispose) |
| `wm._wmSignals` | `wm` | groups display/windowManager/workspaceManager/settings/overview; `disconnectAll` (no dispose) |
| `wm._windowAttach` | `wm-window` | per-window Lifetime; slot `"stack"`; dispose(mw)/disposeAll |
| `wm._layoutBatch` | LayoutBatchDepth | CL5 depth + needsCommit latch |
| `wm._suppressGeom` / `_suppressAbove` / `_suppressRehome` | SuppressFlag | nestable; **always read `.active`** |

**`_wmSources` slots (12):** `queue`, `workspaceChanging`, `manualResizeEnd`, `renderTree` (idle), `reloadTree` (idle), `wsWindowAdd`, `windowHomeReconcile` (idle), `pointerFocus`, `workareasSettle`, `sessionLayoutSave`, `previewHintFailsafe`, `sessionFocusRetry`.  
Call sites: `window.js`, `focus.js`, `workspace.js`, `drag-drop.js`, `monitor-recovery.js`, `session-layout-restore.js`.

#### Optional residual (not blocking nest RC)

| Residual | Note |
| --- | --- |
| Per-window `windowSignals` / `actorSignals` | Still id arrays + `disconnectSignals` |
| Tree WorkspaceManager per-ws signal map | Separate from `_wmSignals` |

**Failure dump:**

```text
wm._wmSources.snapshot()
wm._wmSignals.snapshot()
wm._openCommit.snapshot()
wm._windowAttach.snapshot()
wm._layoutBatch.snapshot()
wm._suppressGeom.snapshot()  // + above / rehome
```

**Tests (2026-08-10 after L8/L11):** `tests/unit/extension/` + `tests/unit/window/` → **1207** green.

```bash
npx vitest run tests/unit/extension/ tests/unit/window/ \
  tests/regression/bug-jnfk-wayland-focus-stacking.test.js \
  tests/regression/bug-w-render-storm.test.js \
  tests/regression/bug-328-disconnect-destroyed-target.test.js
python3 -m pytest tests/unit/cli/test_settle_heuristics.py -q
```

### Nest lifecycle — STOP after tests (FIRM)

If you touch nest at all: **always** `forge nested stop` when done. See [testing.md](./testing.md).

```bash
forge nested stop
forge nested status   # want: running: False
```

### Headless / true cold (when live resumes)

1. Only **durable Grok leader** (or Guake/float) survives closing all tiles.  
2. Windowed Grok dies with its TTY.  
3. After suites that close the agent TILE: leader reopens `ghostty`; operator `grok -r` / `/resume`.

```bash
forge test live probe
# L0 before any live:
python3 -m pytest tests/unit/cli/test_layout_apply.py tests/unit/cli/test_live_matrix.py -q
```

### Nested Wayland (parked procedure)

```bash
forge nested start --monitors=2 --replace
# throwaway shell only:
eval $(forge nested env --export)
forge layout _forge-test-ghosttys
forge nested stop    # FIRM
```

**Do not** leave nest env on durable agent shells. Prefer `forge nested exec -- …`.

---

## Recent ops notes (desk thrash — context only)

- Post-Wayland-restart cold `layout dev` can fail hard-ready (FLOAT) and leave placeholders / nested splits; Mode B thrash-recover works once windows are TILE.
- Per-`wmId` float rows in `~/.config/forge/config/windows.json` pin FLOAT — clean those if float-toggle recovery went wrong.
- Settle heuristics file is usually fine; nest isolation + shared config is a separate discussion.
- Self-heal on failed layout is product spine work — not a substitute for lifecycle bags.

---

## Abandoned / do not revive

| Item | Note |
| --- | --- |
| Unfocus key `Ctrl+Super+Esc` | Abandoned; unbound |
| Mode B as cold success | Forbidden |
| Personal layouts in live matrix | Use `_forge-test-*` only |

---

## Doc map

| Doc | Role |
| --- | --- |
| [PRIORITY.md](./PRIORITY.md) | Queue |
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | **P0 plan (locked)** |
| [completed tasks](./plans/forge-lifecycle-abstractions/completed/) | A1–A6 + W1 |
| [D0 rate](./tasks/forge-lifecycle-abstractions_d0-rate.md) | Lock record |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft product |
| [cold topology](./plans/forge-layout-cold-topology.md) | Spine |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | Parked RC procedure |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
