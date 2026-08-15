# Plan: In-process `ApplyLayout` (layout rearchitecture)

**Status:** **locked as the layout rearch** (D037) — **no implement**
until a 4.6 xhigh design lock (AL0)  
**Priority:** after Insert A live + tab-click residuals + **TD1** tab
strip; before any Python→JS layout_plan port  
**Decision:** [D037](../../docs/DECISIONS.md)  
**Branch:** `master`  
**Related:** [forge-cli-node](./forge-cli-node.md) (thin client only
after this ships) · [project.md](../project.md) § Layout apply
architecture · D019  
**Created:** 2026-08-14

## Why this exists

`forge layout` is a host Python process that **polls GetTree** and
drives RunSteps/LayoutBatch over DBus. That is why apply feels slow
and why planner logic cannot be shared with the Shell.

A Node rewrite of `layout_plan.py` **inside `cli/`** would keep the
same poll loop. Do not do that.

## Goal (product)

One DBus call: `ApplyLayout(profile_json)` (name TBD at lock).

- Extension owns the cold spine
  (`skeleton → open → bind → order/size → hard-ready → focus →
  soft residual → verify`).
- Waits are **Meta signals** + existing bags (`OpenCommitManager`,
  layout pin, sensors) — not CLI `time.sleep` + GetTree.
- CLI (Python today; Node later) loads the profile file and
  **attaches** to the job / streams status. Same user command:
  `forge layout <name>`.
- Planner pures live in `lib/shared/` (or stay next to tree if they
  need Node types from GetTree JSON only — lock at design).
  **Not** a second Python copy.

## Non-goals (until lock)

- Implementing anything in this stub.
- Porting `layout_plan.py` to `cli/` ([CN8–CN12 cancelled](./forge-cli-node.md)).
- Folding IC4 waiters as a standalone CLI cleanup (those waiters
  should **die** with the poll loop).
- Changing profile JSON schema unless the design lock says so.
- Personal-layout branches.

## When to start

1. Insert A R028 live signed off (or explicitly skipped).
2. R025 / R026 tab-click live (same chrome TD1 will touch).
3. **TD1** strip reorder shipped or explicitly deferred by operator.
4. Then **4.6 xhigh** design session → DECISIONS row + implement
   slices (AL0…).

Do **not** start dual-mon nest for the design session.

## Which agent

| Slice | `model` | Prompt as | Notes |
| --- | --- | --- | --- |
| Design lock (AL0) | `grok-4.6` | 4.6 **xhigh**; design only; no code | Spine, DBus shape, what moves from Python, job/chrome |
| Gold dump of current Python plans | `grok-4.5` | 4.5 **low** | Fixture → JSON only; no port |
| Planner pures + gold parity | `grok-4.6` | do not simplify D034/D035 | After lock |
| Extension executor + signals | `grok-4.6` | use named APIs in contracts.md | After planner pures |
| Thin CLI client | `grok-4.5` | 4.5 medium | After DBus method exists |
| Review | `grok-4.6` | A then B if used | After first live `_forge-test-*` apply |

## Design questions (for the lock session — do not answer in a 4.5 task)

1. One method vs begin/progress/end? How does `forge layout` stream
   phase lines today, and must that stay?
2. Does LayoutBatch already cover open-all, or is ApplyLayout a new
   top-level?
3. Job runner: still a host worker that only waits on DBus, or does
   the extension own durability?
4. Where does `plan_reconcile` live: `lib/shared/layout-plan.js`
   (GetTree JSON in / actions out) vs only inside the extension?
5. Chrome overlay (R027) — already extension-side; keep as the
   apply-in-progress signal.

## Session note

**2026-08-14:** Stubbed so CLI-node CN8–CN12 are not started. No
design lock. Wait for operator + 4.6 xhigh session.
