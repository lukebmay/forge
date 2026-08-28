# forge-ai-live-test-matrix

**Verdict:** keep-parallel
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-ai-live-test-matrix.md

## Stated status

Active — harness shipped (probe/plan/run); expand cases as regressions land. AT0–AT3 + AT-W1 **done**; AT-W2 optional.

## Leftovers

- **Living catalog** — add a `LIVE_CASES` row (and a pure unit when expressible) when a live R0xx lands. Not a scheduled product campaign; process lives in `agents/testing.md`.
- **AT-W2** — next-login job queue if nest cannot cover dual-mon CT. Optional; do not build it as a kernel slice.
- **Coarseness (known, not blocking):** `ensure-dev-shape` is structural not full profile-role match; hidden Guake may miss `can_true_cold`.
- **Language:** catalog still Python (`scripts/forge/live_matrix.py`). Node port is `forge-cli-node#CN14` (post-refactor), not this plan.

## Why this verdict

Option 2 rewrites TOM/presenter, not the test pyramid. Agents still need L0 then selective `./scripts/forge/forge-test live` **during** the kernel lift for host surfaces that remain (DBus, layout apply, nest reload). Testing does not wait for import.

This is **not** a product-feature plan. `testing.md` already owns the procedure. Do not pull “expand the matrix” into firm-abstractions slices.

**Why not post-refactor:** parking the harness until after kernel would leave implement sessions without a named live gate. Catalog *cases* that encode current GetTree/apply JSON **will** churn on import — that is a reason **not to grow** the catalog as a refactor workstream, not a reason to stop using probe/plan/run.

**Why not close:** the spine is the durable catalog + capability contract (D022 nest vs HUP, `can_true_cold`, work-hints). Keep the file as the living harness spec; drop it from P0 product PRIORITY so it does not compete with kernel slices. Use it when a change can break desk behavior.

## Destination

Keep `agents/plans/forge-ai-live-test-matrix.md` live as the harness spec, **beside** firm-abstractions but **not** as a P0 implement row. PRIORITY: no “expand matrix” slice. AT-W2 stays optional/unscheduled. Case adds ride along with whatever bug they cover.

## Absorb

- **Pyramid (keep):** L0 before live; select by `--from-work` / tags / behaviors; never default-full-matrix.
- **Capability (keep):** X11+tiled Ghostty ⇒ HUP, no true cold, no nest; Wayland ⇒ nest retest, dual-mon live stays **host**; true cold needs float agent (Guake).
- **D022:** nest is code→reload; not a dual-mon CT substitute. Do not invent logout loops when `can_nested`.
- **Test layouts:** only `_forge-test-*` profiles.
- **Kernel lift:** TOM/OpSet stay unit-tested in proto (`prototypes/container-motion && npm test`). Live matrix covers **Host + presenter** desk behavior. Do not require live E2E to prove gi-free kernel.
- **Do not absorb as a kernel slice:** AT-W2, Python→Node port, “grow L1/L2 catalog.”
