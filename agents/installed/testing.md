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

## Do / don’t

**Do:** boundaries, invariants, critical paths once stable, focused regressions.  
**Don’t:** assert private call order, mirror implementation, freeze experimental APIs mid-design.

## Brittleness

Prefer observable outputs, stable fixtures, injected time/random, temp dirs. Avoid real clocks, important live data (see `security.md`).

## CI (GUIDELINE)

Unit green on every change when CI exists. Critical integration should not be “never run.”
