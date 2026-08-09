# Plan: AI live test matrix (capability + selective run)

**Status:** active — harness shipped (probe/plan/run); expand cases as regressions land  
**Priority:** **P0 first** (unblocks intelligent live sign-off for all other work)  
**Branch:** `master`  
**Related:** [HANDOFF](../HANDOFF.md); [REGRESSIONS](../REGRESSIONS.md); settle SE8b; clean CE1

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
6. **Wayland nested Shell** is a **later** task (AT-W1), only when we resume
   Wayland testing — not blocking X11 agent loop.

### Pyramid (how layers fit)

```text
L0  Unit + focused integration     cheap, always first for the blast radius
     ↑ scripts / vitest / pytest
L1–L2  AI live matrix              expensive, selective; scripted setup + checks
     ↑ forge test live + agent judgment
L3  Wayland / human CT             rarer; same cases when capability allows
```

| Layer | Who runs it | Role |
| --- | --- | --- |
| **L0** | CI / agent on every logic change | Rule out pure / contract bugs first |
| **L1–L2** | Agent via `forge test live` | E2E desk behavior scripts can’t fully own |
| **Script inside L1–L2** | `forge layout`, `forge tree`, close steps, check helpers | Repeatable setup and hard assertions |
| **Agent inside L1–L2** | Choose cases, interpret FAIL, add logs, fix phase | Judgment + iteration |

**Yes, this is intentional:** AI tests are *closer to E2E* than integration, but
they **should still run L0** (for the work area) before or as the first step of
a live campaign so open-leaf thrash isn’t debugged when a pure plan helper is
broken.

---

## CLI (shipped)

```bash
forge test live probe                 # session, agent, can_hup, can_true_cold
forge test live list                  # full catalog JSON
forge test live plan                  # auto: all cases allowed for this capability
forge test live plan --suite partial  # L1 only
forge test live plan --suite cold     # L2 only (needs can_true_cold)
forge test live plan --from-work open-leaf
forge test live plan --from-work cold
forge test live plan --tags R008
forge test live plan --behaviors open-leaf,settle-soft
forge test live run --from-work open-leaf   # destructive execute
forge test live plan --tree-file F.json     # offline
```

Implementation:

| Piece | Path |
| --- | --- |
| Pure catalog + probe + select + checks | `scripts/forge/live_matrix.py` |
| CLI | `forge test live …` in `scripts/forge/forge` |
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
3. forge test live plan --from-work <hint>   # or --behaviors / --tags R0xx
4. If plan is empty, widen once or fix tags on the new case.
5. forge test live run … only for selected cases (not auto-all unless release).
6. On FAIL: use scripts (verbose layout, tree, pin logs) + agent judgment;
   fix the named phase; re-run L0 then the same live subset.
```

---

## Capability matrix

| Session | Agent | HUP retest | True cold |
| --- | --- | --- | --- |
| X11 + Ghostty (tile) | keep Ghostty | yes | **no** |
| X11 + Guake (float) | keep Guake | yes | **yes** |
| Wayland + either | — | **no** | once/login |

Probe prefers **Guake FLOAT** as agent even if keyboard focus is Chrome (mid-test).

---

## Layers / catalog (current)

| Layer | Cases | Notes |
| --- | --- | --- |
| **L0** | pytest/vitest | not via `forge test live` |
| **L1** | ghosttys-only, left-chrome, right-ghostty, t1-nautilus, settled-rerun, close-focus-lft, unfocus | partial + focus |
| **L2** | true-cold-dev, layout-clean | needs `can_true_cold` |

Add cases when filing REGRESSIONS rows.

---

## Wayland retest (deferred — AT-W1)

Do **not** block X11 work. When we next need Wayland live:

1. **AT-W1** nested Mutter/Wayland spike (restart nested Shell only).
2. If that fails → next-login job queue (report files), not chat-across-reboot fantasy.
3. Plain zsh subshell **never** reloads extension JS.

---

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| **AT0** | Capability probe + catalog + select + docs | **done** (this slice) |
| **AT1** | `forge test live run` L1/L2 execute path | **done** (v1 harness) |
| **AT2** | Tighten L1 setups (close mon0/mon1 only; nautilus ensure) | **done** |
| **AT3** | Agent rule: regression → catalog case (REGRESSIONS + testing.md) | **done** |
| **AT-W1** | Nested Wayland Shell retest spike | **optional / later** (before next Wayland CT) |
| **AT-W2** | Next-login queue if AT-W1 fails | optional |

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
