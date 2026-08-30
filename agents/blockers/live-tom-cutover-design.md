# B-live-tom-cutover-design — Lock live Forest sole-source

**Status:** closed
**Severity:** hard
**Owner:** human
**Kind:** design
**Plan:** [agents/plans/forge-live-tom-cutover.md](../plans/forge-live-tom-cutover.md)
**Unblocks:** forge-live-tom-cutover#C0+ (C1–C7)
**Priority:** —
**Created:** 2026-08-29
**Updated:** 2026-08-29
**Closed:** 2026-08-29 — operator lock → **D092**

## Why this was human-only

Choosing live topology (POJO vs thin handle vs stay hybrid), id scheme,
FLOATS home, and migration style is a product/architecture lock.

## Meeting outcome (locked)

| Question | Lock |
| --- | --- |
| Topology | **A** — POJO Forest is live; GObject not topology |
| Ids | **nanoid** per node for node lifetime; host data in `Map<id, bag>` |
| FLOATS | Live bag; no ROOT parking |
| Reality | TOM ↔ host reconcile; **FLOAT fail-safe** |
| Apply (ex-P5c) | **In scope** — desired state is TOM |
| Migration | **Big bang**; no dual-run steady state; no BC |
| Prerequisites | None soft — start cutover after D-row |

CHANGELOG: **D092**. Design: `agents/design.md` (firm architecture + Overview).

## Unblock signal

Met. Agents may implement `forge-live-tom-cutover` slices.
