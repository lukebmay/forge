---
title: Testing
read_when: Adding tests, changing test strategy, or enabling optional features for verification
order: 70
---

# Testing

Rule vocabulary: **FIRM** / **GUIDELINE** / **MAY** (see `general.md`).

## Goal

Catch real bugs without making change expensive. Tests serve the product.

## Optional features in dev (FIRM)

When implementing/debugging an optional feature: **turn it on** in local/dev for that work. Record the enable command in task/handoff. Prefer tests that force the optional path explicitly.

## Pyramid (GUIDELINE)

| Layer | When | Cost |
| --- | --- | --- |
| Unit | Pure logic, parsers, validators | Cheap — be thorough once contract is clear |
| Integration | Critical paths + known gotchas | Few, high value |
| E2E / manual | Full UI when ROI is clear | Rarest |

Do not chase coverage numbers. Prefer one test that would have caught a real bug.

## Lifecycle

| Phase | Stance |
| --- | --- |
| Shape still moving | Sparse tests; unit only on stable pure helpers |
| Contract locked | Build unit suite; integration on critical paths |
| Bug found | Regression test when cheap and non-brittle |
| **Live layout bug** | REGRESSIONS row + unit if pure + **`LIVE_CASES` R0xx** in `live_matrix.py` |

## Forge AI live matrix (GUIDELINE)

AI live cases are **E2E-class** (desk behavior hard to fully script). They
**use scripting** for setup/apply/tree/checks; the agent supplies selection,
judgment, and debug. They **do not replace** unit/integration tests.

**Order (FIRM for layout work):**

1. **L0** — relevant unit/integration for the blast radius  
2. **`forge test live plan/run`** — selected E2E cases only  
3. Fix phase → re-run L0 → re-run same live subset  

```bash
# L0 example (adjust to touch paths)
python3 -m pytest tests/unit/cli/test_layout_apply.py -q
# then live
forge test live probe
forge test live plan --from-work <hint>   # or --behaviors / --tags R0xx
forge test live run --from-work <hint>    # only selected cases
```

| Rule | Detail |
| --- | --- |
| **L0 before live** | Rule out pure bugs before dual-mon thrash |
| **Select by blast radius** | Only cases whose behaviors the change can break |
| **Not always full suite** | `plan` without filters is max-for-capability, not mandatory run |
| **Regression → catalog + unit** | Live R0xx → `LIVE_CASES` tag; pure test when possible |
| **Capability** | True cold needs Guake/float agent; X11 for HUP loops; Wayland: `can_nested` / `can_retest` |
| **Wayland retest** | See **§ Wayland live testing workflow** below (FIRM when session is Wayland) |
| **CLI jobs** | Mutating `forge` runs as durable jobs — closing the agent TTY does **not** abort apply. True cold still needs non-tile agent **window** placement. Job runner units: `tests/unit/cli/test_job_runner.py` |
| **L1 setup** | `close-mon0/1-chrome` by tree mon; `ensure-nautilus` / `ensure-dev-shape` real (AT2). Units: `tests/unit/cli/test_live_matrix.py` |
| **Focus live** | `--from-work close` → `L1.close-focus-lft` (close→LFT). Unfocus key product **abandoned**. |
| **True cold / headless** | Durable Grok leader required if agent TILE will close. After suite, leader reopens Ghostty head; operator `grok -r`. Windowed clients die with TTY and cannot self-reattach. |
| **Test layouts** | Only `_forge-test-*` profiles — not personal `dev`/`t1` |

Plan: `agents/plans/forge-ai-live-test-matrix.md`.  
Handoff quick ref: `agents/HANDOFF.md` § Nested Wayland / Wayland smoke loop.

---

## Wayland live testing workflow (FIRM when on Wayland)

Use this whenever the login session is **Wayland** and work needs **install / extension
JS reload / dual-mon desk smoke**. Do **not** invent logout loops for mid-campaign
retests when `can_nested` is true.

### Two layers (do not conflate)

| Layer | What it proves | Where it runs | How extension code reloads |
| --- | --- | --- | --- |
| **A — Nest retest** | Extension loads, DBus Forge works, single-mon shell behavior | Nested Shell window (`forge nested`) | `forge nested restart` (no host logout) |
| **B — Host dual-mon live** | Real dual 4K desk: layout, open leaf, focus, cold/partial | **Host** Wayland session | Host cannot HUP — tip must already be on host **or** one logout after first install this boot |

| Also | Role |
| --- | --- |
| **L0** | Unit/integration for pure/contract bugs — always before expensive live |
| **CLI-only** (`layout_apply` / `forge` Python) | Live on host **without** nest restart or HUP |

Nest is **single virtual monitor**. It is **not** a substitute for dual-mon CT / matrix
geometry. Host desk remains the authority for dual-mon sign-off.

### Capability gates

```bash
forge test live probe          # host desk + can_hup / can_nested / can_retest
forge nested doctor            # nest host tools only (exit 0 if can nest)
```

| Field | Meaning |
| --- | --- |
| `can_hup` | X11 only — `killall -HUP gnome-shell` reloads host extension |
| `can_nested` | Wayland host + tools — `forge nested` allowed |
| `can_retest` | `can_hup` **or** `can_nested` — agent can iterate without fantasy reboot |

On **X11:** use HUP; `forge nested start` **exits 2** with HUP guidance (not a crash).

### Extensive Wayland smoke loop (default agent campaign)

```text
0. Confirm: XDG_SESSION_TYPE=wayland; forge test live probe → can_nested=true
1. L0 for blast radius (pytest/vitest)
2. Install tip: ./install   # or forge install
3. Nest up (only while actively testing nest / extension reload):
     forge nested doctor
     forge nested start          # or restart if already up
     # throwaway shell only — never leave nest env on durable agent shell:
     eval $(forge nested env --export) && forge ping
4. Host dual-mon cases (host env only — nest must NOT be exported here):
     forge nested stop           # FIRM if nest work is done for this stretch
     forge test live plan --from-work <hint>
     forge test live run  --from-work <hint>
5. Code change → re-install → forge nested restart → re-run L0 + nest subset
6. Repeat until green. Logout only if host Shell never loaded this tip
   (first install this boot) and host dual-mon requires host-loaded extension.
7. ALWAYS before wrap-up / handoff / idle: forge nested stop
     forge nested status         # running: False
```

### Nest stop after tests (FIRM)

| Rule | Detail |
| --- | --- |
| **Stop when done** | After nest cases finish for this session/prompt → `forge nested stop` |
| **Stop before host matrix** | Do not run host `forge layout` / `forge test live` with nest env exported |
| **Verify** | `forge nested status` → `running: False` |
| **No durable export** | Prefer `forge nested exec -- <cmd>` or a throwaway terminal |
| **Wrap-up gate** | Commit/handoff only after nest is stopped (or status proves already down) |

Leaving nests up wastes resources and can leave orphan session buses that
`status` may not always see if pid files went stale.

**Shell env trap:** `eval $(forge nested env --export)` points `WAYLAND_DISPLAY` +
`DBUS_SESSION_BUS_ADDRESS` at the **nest**. Host dual-mon commands must use the
**host** bus/display. Prefer a separate terminal for nest health, or unset nest
exports before host `forge tree` / `forge layout` / `forge test live run`.

### Minimal commands (cheat sheet)

```bash
# Reload extension JS mid-campaign (Wayland)
./install && forge nested restart

# Nest health (throwaway shell)
forge nested status
eval $(forge nested env --export) && forge ping
# … nest tests …
forge nested stop              # FIRM when nest work ends
forge nested status            # running: False

# Host live (dual-mon) — host env only
forge test live probe
forge test live run --from-work open-leaf   # example
# Prefer _forge-test-* layouts, not personal dev/t1

# Make aliases
make nested-start | nested-restart | nested-stop | nested-status
```

### When logout is still required

| Situation | Action |
| --- | --- |
| Host never loaded this build this boot, and case needs **host** dual-mon extension | One logout/in, then prefer nest for further JS reloads |
| `can_nested=false` (`forge nested doctor`) | Fix tools/host Wayland, or logout once |
| Changing only CLI Python (no extension JS) | No nest restart, no logout |

### X11 contrast (same product)

```bash
./install && killall -HUP gnome-shell    # host reloads
forge test live run --from-work <hint>
```

### Ownership

| Piece | Path |
| --- | --- |
| Nest module / CLI | `scripts/forge/nested_wayland.py`, `forge nested …` |
| Units | `tests/unit/cli/test_nested_wayland.py`, live_matrix probe fields |
| Plan | `agents/plans/forge-ai-live-test-matrix.md` (AT-W1) |
| CT2 host cold | `agents/tasks/forge-layout-cold-topology_ct2-wayland-live.md` |
| shellrc twin (optional) | `nested-gnome` — not a forge dependency |

## Do / don’t

**Do:** boundaries, invariants, critical paths once stable, focused regressions.  
**Don’t:** assert private call order, mirror implementation, freeze experimental APIs mid-design.

## Brittleness

Prefer observable outputs, stable fixtures, injected time/random, temp dirs. Avoid real clocks, important live data (see `security.md`).

## CI (GUIDELINE)

Unit green on every change when CI exists. Critical integration should not be “never run.”
