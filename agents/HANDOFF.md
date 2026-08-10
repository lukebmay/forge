# Handoff — forge (lukebmay)

**Updated:** 2026-08-10 (lifecycle abstractions **P0** before more Wayland RC)  
**Branch:** **`master`** (default).  
**Sessions:** **Wayland** daily driver; nest dual-mon available for later RC.  
**Agent terminal:** Durable **Grok leader** for true cold (closes agent TILE). Guake/float also OK.  
**Jobs (shipped):** Mutating `forge` durable by default.  
**Layouts for tests:** only **`_forge-test-*`** — never personal `dev` / `t1` in matrix.  
**Wayland RC suite:** [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) · results `agents/test-results/wayland/` — **parked** under P0 abstractions (see below).

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

Lifecycle: prefer **owned bags** (sources/signals/lifetime) so disable/destroy cannot forget cleanup — not another one-off timer field.

---

## Start here (next agent)

| Pri | Work | Path |
| --- | --- | --- |
| **P0 now** | **Lifecycle / pure abstractions:** rate candidates, invent more, utils audit, unit-test plan — **lock before code** | [plan](./plans/forge-lifecycle-abstractions.md) · [D0 task](./tasks/forge-lifecycle-abstractions_d0-rate.md) |
| after lock | Implement pure modules + comprehensive unit tests; wire one owner at a time | follow-up tasks from D0 |
| parked | Nest isolation discussion (still valid; not cancelled) | [D0 nest](./tasks/forge-nested-isolation_d0-discussion.md) |
| parked | Wayland nest dual-mon RC + host L1 on `_forge-test-*` | [suite](./plans/forge-wayland-rc-test-suite.md) |
| later | STACKED product / resize-autotile | other plans — do not mix into cold spine |
| done | R007; D019 SE0–SE9; AT-W1 nest; CLI jobs; place→structure residual; leader true-cold; `_forge-test-*` profiles | completed/ |

### P0 — Lifecycle abstractions (read this)

**Operator direction (2026-08-10):** Prioritize these abstractions **before continuing Wayland testing.**

1. Open [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md) and [D0 rate task](./tasks/forge-lifecycle-abstractions_d0-rate.md).
2. **Examine and rate** the proposed lines (L1–L9 in the plan): SourceBag, SignalBag, Lifetime, per-window attach, suppress tokens, heuristics HQueue, catalog façade, OpenCommit manager, utils split.
3. **Identify other** useful, **unit-testable** abstractions that improve quality, reduce bugs, and avoid duplication (reuse). Reject rename-only splits.
4. **Audit `lib/extension/utils.js`** (and related helpers) for keep vs domain split + missing tests.
5. Write a **test strategy** (unit-first; inject GLib; heuristics JS↔CLI golden parity).
6. Recommend implement order + **first pure slice**; get **user lock** before coding large extracts.
7. Do **not** treat shrinking `window.js` line count as the goal. Health = ownership, cleanup contracts, pure reuse, tests.

Existing partials (reuse): `disconnectSignals` / `_clearTimeoutId` in `window.js`; `glibSchedule`/`glibCancel` in `layout-controller.js`; `app-thrash-catalog.js`; `layout-open.js`; `settle_heuristics.py`.

### Nest lifecycle — STOP after tests (FIRM)

If you touch nest at all (not the P0 focus): **always** `forge nested stop` when done. See historical detail below and [testing.md](./testing.md).

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
| [lifecycle abstractions](./plans/forge-lifecycle-abstractions.md) | **P0 plan** |
| [D0 rate task](./tasks/forge-lifecycle-abstractions_d0-rate.md) | **Start work here** |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft product |
| [cold topology](./plans/forge-layout-cold-topology.md) | Spine |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | Parked RC procedure |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
