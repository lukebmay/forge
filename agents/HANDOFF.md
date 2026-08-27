# Handoff — forge (lukebmay)

**Updated:** 2026-08-27 — Firm abstractions (planning next)
**Branch:** **`master`**. Nest **stopped**. **Push:** only when human asks.
**Active stream:** **planning** — major refactor for clean, firm
abstractions. Not implement. Not proto desk bugs.

## Pain (read this first)

The next session is a **planning meeting**. The critical priority is
**clean, firm abstractions**: named APIs, one word one meaning, policy
out of the kernel, presenter ≠ model, no hand-rolled twins.

Do **not** resume Mark 2 proto slices, Shell Move, D069 tip, Super+2, or
other PRIORITY leftovers until the scan below says they belong.

## Next session

1. **Write the refactor plan(s)** for firm abstractions (TOM / OpSet /
   presenter / Shell / contracts). Scope and slices live on that plan,
   not in this file.
2. **Scan every still-open plan** under `agents/plans/` plus PRIORITY,
   blockers, and ideas. For each: **close**, **abandon**, or **pull in**
   (into the refactor, or as explicit **post-refactor** work). The scan
   **is** a required slice of the planning session. Output is a new
   ordered queue — no shadow lists left behind.
3. Only after (1)+(2) exist: implement. Not before.

Mark 2 proto is **paused** until that plan says port / reshape / park.

## Where parked context lives

| What | Where |
| --- | --- |
| Mark 2 rules + process | [`prototypes/container-motion/src/opsets/mark2.md`](../prototypes/container-motion/src/opsets/mark2.md) · proto README · [container-motion plan § Parked HANDOFF extract](./plans/forge-container-motion-design.md#parked-handoff-extract-2026-08-27) |
| Design locks | [`design.md`](./design.md) · [`design/CHANGELOG.md`](./design/CHANGELOG.md) (D073–D078) |
| Old P0 leftovers | [`PRIORITY.md`](./PRIORITY.md) § Parked until plan scan |

## Do not

- Start the refactor implementation this session (plan first)
- Port Mark 2 into Shell
- Invent a second glossary
- Skip the plan scan
