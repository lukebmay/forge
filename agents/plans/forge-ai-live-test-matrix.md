# Plan: AI live test matrix (capability + selective run)

**Status:** active — harness shipped (probe/plan/run); expand cases as regressions land  
**Priority:** living — **gated behind D100b** (thin adapter core). Not
the topology P0. Do not run the matrix expecting idle restore /
entered-monitor rehome / title→`renderTree`.
**Branch:** `master`  
**Related:** [HANDOFF](../HANDOFF.md); [D100](../design/CHANGELOG.md);
[retire GObject](./forge-retire-gobject-topology.md)

---

## Product rules (locked)

1. **AI live cases are E2E-class**, not a second unit suite. They cover what is
   hard or brittle to fully assert with scripts alone (dual-mon open leaf,
   focus thrash, “desk looks right,” agent survival across layout). They **use
   scripting heavily** for setup, layout apply, tree dumps, and mechanical
   checks — the agent supplies judgment, selective reruns, and debug when
   scripts fail or signals are ambiguous.
2. **Always prefer cheap gates first.** Before expensive live E2E for a change,
   run the **relevant unit / integration** tests (L0). An AI live run that
   skips failing pure tests wastes time and confuses root cause. Live matrix
   may *invoke* L0 for the selected behaviors; it does not replace L0.
3. **Every live regression** (REGRESSIONS R0xx that is dual-mon/live) gets a
   **catalog case** tagged with that id *and* a pure unit test when the bug
   class is expressible in pure helpers.
4. **Do not run the whole matrix by default.** Select by what the current work
   can change (`--from-work`, `--behaviors`, `--tags`).
5. **Capability gates** refuse unsafe suites (e.g. true cold with tiled Ghostty agent).
6. **Wayland nested Shell** (AT-W1 **shipped**): `forge nested restart` for
   extension retest on Wayland host; not blocking X11 agent loop (HUP there).

### Pyramid (how layers fit)

```text
L0  Unit + focused integration     cheap, always first for the blast radius
     ↑ scripts / vitest / pytest
L1–L2  AI live matrix              expensive, selective; scripted setup + checks
     ↑ ./scripts/forge/forge-test live + agent judgment
L3  Wayland / human CT             rarer; same cases when capability allows
```

| Layer | Who runs it | Role |
| --- | --- | --- |
| **L0** | CI / agent on every logic change | Rule out pure / contract bugs first |
| **L1–L2** | Agent via `./scripts/forge/forge-test live` | E2E desk behavior scripts can’t fully own |
| **Script inside L1–L2** | `forge layout`, `forge tree`, close steps, check helpers | Repeatable setup and hard assertions |
| **Agent inside L1–L2** | Choose cases, interpret FAIL, add logs, fix phase | Judgment + iteration |

**Yes, this is intentional:** AI tests are *closer to E2E* than integration, but
they **should still run L0** (for the work area) before or as the first step of
a live campaign so open-leaf thrash isn’t debugged when a pure plan helper is
broken.

---

## CLI (shipped)

```bash
./scripts/forge/forge-test live probe                 # session, agent, can_hup, can_true_cold
./scripts/forge/forge-test live list                  # full catalog JSON
./scripts/forge/forge-test live plan                  # auto: all cases allowed for this capability
./scripts/forge/forge-test live plan --suite partial  # L1 only
./scripts/forge/forge-test live plan --suite cold     # L2 only (needs can_true_cold)
./scripts/forge/forge-test live plan --from-work open-leaf
./scripts/forge/forge-test live plan --from-work cold
./scripts/forge/forge-test live plan --tags R008
./scripts/forge/forge-test live plan --behaviors open-leaf,settle-soft
./scripts/forge/forge-test live run --from-work open-leaf   # destructive execute
./scripts/forge/forge-test live plan --tree-file F.json     # offline
```

Implementation:

| Piece | Path |
| --- | --- |
| Pure catalog + probe + select + checks | `scripts/forge/live_matrix.py` |
| CLI | `./scripts/forge/forge-test live …` (`scripts/forge/forge-test`) |
| Units | `tests/unit/cli/test_live_matrix.py` |

---

## Intelligent selection

| Input | Effect |
| --- | --- |
| `--suite partial` | L1 only (Ghostty-safe) |
| `--suite cold` | L2 only; skip if not `can_true_cold` |
| `--suite auto` | L1 + L2 allowed by capability |
| `--suite regression` | requires `--tags` and/or `--behaviors` |
| `--from-work HINT` | maps work area → behaviors (see WORK_HINTS) |
| `--behaviors a,b` | case must touch ≥1 listed behavior |
| `--tags R008,…` | case must include ≥1 tag |
| `--cases id,…` | explicit ids only |

### Work hints → behaviors (kept tight — match is OR)

| Hint | Behaviors |
| --- | --- |
| `layout-apply` | layout-apply, structure-bind |
| `open-leaf` | open-leaf, chrome-map, settle-soft |
| `focus` | profile-focus, settle-soft |
| `cold` | cold-open only (true cold case) |
| `clean` | clean-empty |
| `close` | close-focus |
| `save` | save-focus |
| `settle` | settle-soft |
| `dock` | dock-open, mon-claim |
| `partial` | partial-reload |
| `l2` | full L2 layer (cold + clean) |

### Agent policy when deciding what to run

```text
1. Name the behaviors this change can affect (phase + surface).
2. Run L0 for that blast radius first (pytest/vitest paths that touch the change).
   Stop and fix L0 failures before live E2E.
3. ./scripts/forge/forge-test live plan --from-work <hint>   # or --behaviors / --tags R0xx
4. If plan is empty, widen once or fix tags on the new case.
5. ./scripts/forge/forge-test live run … only for selected cases (not auto-all unless release).
6. On FAIL: use scripts (verbose layout, tree, pin logs) + agent judgment;
   fix the named phase; re-run L0 then the same live subset.
```

---

## Capability matrix

| Session | Agent | HUP retest | Nested retest | True cold |
| --- | --- | --- | --- | --- |
| X11 + Ghostty (tile) | keep Ghostty | yes (`can_hup`) | **no** (`forge nested` exit 2) | **no** |
| X11 + Guake (float) | keep Guake | yes | no | **yes** |
| Wayland + either | — | **no** | **yes** (`can_nested` → `forge nested restart`) | host once/login if tip never loaded |

Probe fields: `can_hup`, `can_nested`, `can_retest` (= hup ∨ nested).  
Probe prefers **Guake FLOAT** as agent even if keyboard focus is Chrome (mid-test).

**Wayland dual-mon live** still runs on the **host** desk. Nest is for extension JS
reload (single virtual monitor), not a dual-mon CT substitute.

---

## Layers / catalog (current)

| Layer | Cases | Notes |
| --- | --- | --- |
| **L0** | pytest/vitest | not via `./scripts/forge/forge-test live` |
| **L1** | ghosttys-only, left-chrome, right-ghostty, t1-nautilus, settled-rerun, close-focus-lft, unfocus | partial + focus |
| **L2** | true-cold-dev, layout-clean | needs `can_true_cold` |

Add cases when filing REGRESSIONS rows.

---

## Wayland retest (AT-W1 — harness shipped)

Do **not** block X11 work. Nested retest path (no host logout):

```bash
# From a host Wayland session (nested shell appears as a window):
forge nested start                  # private bus + nest + enable Forge
eval $(forge nested env --export)   # point forge/apps at nest
forge ping                          # must talk to nested Forge
# … install/rebuild host tree, then:
forge nested restart                # reload extension JS (no logout)
forge nested stop
# Make helpers: make nested-start | nested-restart | nested-stop | nested-status
```

| Piece | Path |
| --- | --- |
| Module | `scripts/forge/nested_wayland.py` |
| CLI | `forge nested start\|stop\|restart\|status\|env\|exec\|enable-forge\|logs\|wait` |
| Units | `tests/unit/cli/test_nested_wayland.py` |
| Make | `nested-start` / `nested-restart` / `nested-stop` / `nested-status` |
| State | `~/.local/state/forge/nested/<name>/` (`FORGE_NESTED_ROOT`) |

**Proven (2026-08-09):** start → Forge DBus ready → `forge ping` ok → restart → stop on
host Wayland. Independent of shellrc (generic twin: shellrc `nested-gnome`).

Still optional for day-to-day X11 matrix. Use before Wayland CT / logout-heavy retests.

1. **AT-W1** nested Mutter/Wayland harness — **shipped** (above).
2. **AT-W2** if nest insufficient for dual-mon CT → next-login job queue (report files).
3. Plain zsh subshell **never** reloads extension JS (use `forge nested restart`).

---

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| **AT0** | Capability probe + catalog + select + docs | **done** (this slice) |
| **AT1** | `./scripts/forge/forge-test live run` L1/L2 execute path | **done** (v1 harness) |
| **AT2** | Tighten L1 setups (close mon0/mon1 only; nautilus ensure) | **done** |
| **AT3** | Agent rule: regression → catalog case (REGRESSIONS + testing.md) | **done** |
| **AT-W1** | Nested Wayland Shell retest harness | **done** (spike + CLI; dual-mon CT still human) |
| **AT-W2** | Next-login queue if nest insufficient for full CT | optional |

### AT2 setup precision (shipped)

| Setup step | Behavior |
| --- | --- |
| `close-chrome` | All TILE chrome-family windows |
| `close-mon0-chrome` / `close-mon1-chrome` | Same, filtered by **tree monitor index** |
| `ensure-nautilus` | Launch Nautilus if no nautilus window |
| `ensure-dev-shape` | No-op if dual-mon tabbed + ghostty+chrome tiles; else one `layout dev` |
| `ensure-some-tiles` | No-op if any TILE (excl. agent keep); else `layout dev` |
| `keep-agent` / `keep-ghostty-tiles` / `keep-mon1` | Declarative (close helpers + post-checks) |

**Remaining coarseness:** shape heuristic is structural (not full profile role match);
hidden Guake may still miss `can_true_cold` when absent from `forge tree`.

---

## Non-goals

- Replacing unit tests
- Running full matrix on every micro-edit
- Auto-login reboot as default agent loop
