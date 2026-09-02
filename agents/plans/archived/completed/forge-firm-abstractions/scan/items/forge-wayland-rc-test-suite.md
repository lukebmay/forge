# forge-wayland-rc-test-suite

**Verdict:** keep-parallel
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-wayland-rc-test-suite.md

## Stated status

Active **procedure** — last black run green 2026-08-10 (R013/R014 cleared). Not an unimplemented product campaign.

## Leftovers

- **Runbook, not slices** — no open implement IDs. R013/R014 task is in `completed/`.
- **Nest die** (2026-08-09) — nested shell sometimes exits ~2s after enable; first start/ping can still be green. Optional hunt; not a kernel blocker.
- **Unfocus Wayland** — Meta TILE remains focused; unfocus **product abandoned** (`testing.md`). Do not reopen.
- **Full RC bar** — re-run `--from-work wayland-rc` when cutting a ship, not as a daily kernel gate.
- Overlaps `agents/testing.md` § Wayland + `forge-ai-live-test-matrix`. This file owns duplicable RC catalog, profiles, pass criteria, and metrics JSON.

## Why this verdict

This is a **duplicable Wayland RC procedure**, not a TOM/OpSet feature. Option 2 does not wait on a green RC matrix to start the kernel. Agents on a Wayland host still need nest-first retest **during** Host/presenter work (`can_nested`, `forge nested run`, stop nest after tests). That workflow cannot park until after import.

**Why not post-refactor the whole spine:** nest + selective live are current testing.md FIRM. Parking them would force logout loops or untested Shell JS mid-refactor.

**Why not treat it as a kernel slice / P0:** the *full* dual-mon RC catalog (L1/L2, `_forge-test-*` profiles, metrics vs older host) **would churn** if GetTree/apply/layout JSON moves with the kernel. Do not schedule “run Wayland RC” as a firm-abstractions slice. Use nest + L0 + a selected live subset when the change can break desk behavior; save the RC bar for a later ship gate (after import, or when Host layout apply is the thing under test).

**Not a product-feature plan.** Do not pull pass-criteria or report JSON into `layers.md`. Keep this file as the RC runbook next to the live-matrix harness spec.

## Destination

Keep `agents/plans/forge-wayland-rc-test-suite.md` as the living RC runbook, **beside** the refactor, **not** on PRIORITY as implement work. No archive. Pair with `forge-ai-live-test-matrix` (harness) and `testing.md` (FIRM nest-first). Full `--from-work wayland-rc` is a ship/RC action, not P0c leftover.

## Absorb

- **Nest vs host (D022):** nest default 1 mon; `--monitors=2` only for multi-mon nest cases. Dual-4K L1/L2 stay **host**. Stop nest after tests; do not export nest env into the host dual-mon shell.
- **Profiles:** only `_forge-test-*` (never personal `dev`/`t1`) for matrix/RC.
- **Pass bar (Host/presenter later):** L0 first; agent Ghostty survives; open-leaf class R005/R007; no Mode B as cold success. Do not encode this as TOM acceptance.
- **Metrics path:** `agents/test-results/wayland/` — keep if RC is re-run; not a kernel artifact.
- **Do not absorb:** nest-die hunt, unfocus, isolation plan implement, “expand RC cases.”
