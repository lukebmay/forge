# forge-layout-in-process_al0-design — ApplyLayout design lock

**Status:** done  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6` prompted as **4.6 xhigh**. Design only. **No
code.** Do not assign to 4.5.

## Goal

Lock how `forge layout` becomes one DBus `ApplyLayout` run **inside**
the extension on Meta signals. This is D037. It replaces any idea of
porting `layout_plan.py` into `cli/`.

## Acceptance

- [x] Written options + recommendation in the plan
- [x] Explicit locks (or OPEN-with-recommendation) for: DBus shape,
      job durability, where `plan_reconcile` lives
- [x] DECISIONS: D037 tightened; D038 landed for method/job/planner
- [x] Follow-up implement tasks AL1–AL8 drafted
- [x] No production code in this slice
- [x] IC4 marked skip when AL ships (waiters die with the poll loop)

## Context for the next agent (complete + succinct)

### Locks (do not re-litigate)

| Topic | Lock |
| --- | --- |
| Method | `ApplyLayout` — **async start**, not blocking return-when-done |
| Also | `GetLayoutApply`, `CancelLayoutApply`, signals `LayoutApplyProgress` / `LayoutApplyDone` |
| LayoutBatch | Stays a primitive; ApplyLayout **calls** it. Not the product entry. |
| Jobs | D021 host job = **observer** (attach/stream/cancel). Extension owns the in-memory run. Disconnect ≠ cancel. |
| Planner | `lib/shared/layout-plan.js` — GetTree JSON in / actions out; gi-free |
| Chrome | R027 / D010 stays; lifetime = apply run (not 30s hard-clear) |
| Flatten | Executor never `_layoutOp` (REG-ensure-flatten). Use `setLayout` + skeleton/bind. |
| IC4 | **Skip** when AL8 deletes CLI waiters |
| CLI keeps | profile load, list/show/save, gdisplays, SettingsLoad, D021 wrap |
| CLI loses | launch/wait/hard/soft/focus/verify/GetTree poll orchestration |

### Why not a cli/ port

Cold apply time is app map + D019 waits + GetTree polls. Node would
keep the polls. Planner must sit next to Meta; waits must be signals.

### Next

Operator ack of [the plan](../plans/forge-layout-in-process.md). Then
**AL1** (expected dump, 4.5 low) and **AL4** (DBus stub, 4.6) in
parallel. Do not assign planner port to 4.5. Do not mix TD1 / CN0–CN6.

### OPEN (not blocking)

1. Stderr: same phases, not frozen strings (recommend).
2. `FORGE_LAYOUT_LEGACY` only during AL8, then delete (recommend).

### Do not

- Start fixture-porting `layout_plan.py` in this task
- Assign AL0 to grok-4.5
- Implement production code
- Mix into TD1 or CN0–CN6
- Update `agents/PRIORITY.md` (orchestrator)

### Depends

Insert A live + R025/R026 live + **TD1** shipped — **all done**.

## Session note

**2026-08-15 (later):** AL1 + AL4 implemented (operator continued
unblocked work on new Wayland session). See completed AL1/AL4 tasks.

**2026-08-15:** AL0 locked. Plan expanded; D038 added; IC4 skip
reason written; AL1–AL8 stubs drafted. Ready for operator ack, then
AL1 + AL4. No production code.

**2026-08-14:** Stubbed at campaign lock. Waiting for queue.
