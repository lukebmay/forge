# forge-layout-in-process_al0-design — ApplyLayout design lock

**Status:** later — **after TD1**; 4.6 xhigh only  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.6` prompted as **4.6 xhigh**. Design only. **No
code.** Do not assign to 4.5.

## Goal

Lock how `forge layout` becomes one DBus `ApplyLayout` (name TBD)
run **inside** the extension on Meta signals. This is D037. It
replaces any idea of porting `layout_plan.py` into `cli/`.

## Acceptance

- [ ] Written options + recommendation in the plan (or this task)
- [ ] Explicit operator lock on: DBus shape, job durability, where
      `plan_reconcile` lives (`lib/shared` vs extension-only)
- [ ] DECISIONS row updated if the method name / spine changes
- [ ] Follow-up implement tasks (AL1…) drafted **after** lock
- [ ] No production code in this slice
- [ ] IC4 marked skip if waiters will die with the poll loop

## Context for the next agent (complete + succinct)

### Why not a cli/ port

Cold apply time is app map + D019 waits + GetTree polls. Node would
keep the polls. Planner must sit next to Meta.

### Questions to lock (do not answer as 4.5)

1. One method vs begin/progress/end? How does today’s CLI stream
   phase lines?
2. LayoutBatch vs a new top-level ApplyLayout?
3. Job runner: host worker that only waits on DBus, or extension-
   owned durability?
4. `plan_reconcile(profile, forestJson) -> actions` as
   `lib/shared/layout-plan.js`?
5. R027 chrome stays the in-progress signal?

### Do not

- Start gold-porting `layout_plan.py`
- Assign this to grok-4.5
- Mix into TD1 or CN0–CN6

### Depends

Insert A live + R025/R026 live + **TD1** shipped (or operator
defers TD1 in writing).

## Session note

**2026-08-14:** Stubbed at campaign lock. Waiting for queue.
