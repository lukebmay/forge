# Testing

Rule vocabulary: **FIRM** / **GUIDELINE** / **MAY** (see `general.md`).

## Goal

Catch real bugs and regressions **without** making change expensive. Tests serve the product; the product does not serve the test suite.

## Pyramid (GUIDELINE)

| Layer | When | Cost bar |
| --- | --- | --- |
| **Unit** | Pure logic, parsers, migrators, authz, graders, validators | Cheap — **be comprehensive** once a unit’s contract is clear |
| **Integration** | Critical paths + known gotchas (auth → write → read; multi-doc commands; boot) | Expensive — **few, high value** |
| **E2E / manual smoke** | Full UI loops when automation ROI is clear | Rarest |

Do **not** test for the sake of coverage numbers. Prefer one test that would have caught a real bug over five that only assert mocks called.

## Feature lifecycle (FIRM-ish default)

| Phase | Testing stance |
| --- | --- |
| **Exploratory / shape still moving** | Sparse tests; favor unit on stable pure helpers only |
| **Contract locked** | Build unit suite out; add integration for critical paths |
| **Bug found** | Prefer a regression test when cheap and non-brittle (**GUIDELINE**) |

Changing product code must not routinely cost more time updating tests than implementing the fix. If it does, tests are too brittle or too early — fix the tests’ design, not only the product.

## What to test

**Do**

- Boundaries: parse, validate, migrate, authorize, grade, serialize  
- Invariants: “never send keys to client,” atomic write, fail-closed authz  
- Critical user paths once stable (login → save → submit)  
- Regression cases for bugs that escaped (when a focused test is easy)

**Don’t**

- Assert internal call order / private structure that will churn  
- Mirror implementation line-by-line  
- Duplicate framework behavior  
- Freeze experimental APIs with a wall of tests mid-design  

## TDD (GUIDELINE)

- **Often good** for pure units with a clear contract (parser, migrator step, permission check).  
- **Often poor** for UI/integration while UX is still moving — spike first, then lock tests.  
- Use judgment; TDD is a tool, not a religion.

## Brittleness

| Prefer | Avoid |
| --- | --- |
| Observable outputs and public contracts | Snapshot noise for whole pages without need |
| Stable fixtures with explicit intent | Goldens that rewrite every cosmetic change |
| Time/random injected | Real clock/sleep flakiness |
| Temp dirs / fake FS | Mutating important live data (see `security.md`) |

## Shared contracts (GUIDELINE)

When client and server share schemas/types/validators (see `languages/rest-api.md`), test those **once** in the shared package — not separately with drift-prone copies.

## Naming & layout (GUIDELINE)

- Colocate `*.test.ts` / `test_*.py` with code, or mirror tree under `tests/` — match the repo.  
- Name tests by **behavior**: `rejects unknown schemaVersion`, not `test1`.  
- One conceptual assertion cluster per test; multi-assert OK when same scenario.

## CI (GUIDELINE)

- Unit suite green on every change when the project has CI.  
- Integration optional/nightly if slow — but critical-path integration should not be “never run.”
