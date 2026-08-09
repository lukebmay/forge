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
| **Capability** | True cold needs Guake/float agent; X11 for HUP loops |
| **Wayland retest** | Host Wayland: `forge nested restart` (AT-W1) — **not** logout for JS reload. Dual-mon live still host desk. X11: HUP; `forge nested` exits 2. Probe: `can_nested` / `can_retest` |
| **CLI jobs** | Mutating `forge` runs as durable jobs — closing the agent TTY does **not** abort apply. True cold still needs non-tile agent **window** placement. Job runner units: `tests/unit/cli/test_job_runner.py` |
| **L1 setup** | `close-mon0/1-chrome` by tree mon; `ensure-nautilus` / `ensure-dev-shape` real (AT2). Units: `tests/unit/cli/test_live_matrix.py` |
| **Focus live** | `--from-work close` / `unfocus` → `L1.close-focus-lft` / `L1.unfocus`; RunSteps `unfocus` (FC3) |

Plan: `agents/plans/forge-ai-live-test-matrix.md`.

## Do / don’t

**Do:** boundaries, invariants, critical paths once stable, focused regressions.  
**Don’t:** assert private call order, mirror implementation, freeze experimental APIs mid-design.

## Brittleness

Prefer observable outputs, stable fixtures, injected time/random, temp dirs. Avoid real clocks, important live data (see `security.md`).

## CI (GUIDELINE)

Unit green on every change when CI exists. Critical integration should not be “never run.”
