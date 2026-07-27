# TZ-mode-a-nested — Mode A collect under role VSPLIT (live residual)

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Done  
**Priority:** P0 residual after thrash-zero ship  
**Depends:** TZ-collect + TZ-detect shipped  
**Task force:** A implement → B verify  

## Live evidence (black, 2026-07-27)

**Setup:** original `dev` desk → Nautilus below **left** Ghostty → Facebook +
Chess under **right** Ghostty → `forge workon dev`.

| Expected (Mode A) | Actual (pre-fix) |
| --- | --- |
| Nautilus tab into mon0 term (left Ghostty view) | Mode B park dump |
| FB + Chess tab into mon1 term (right Ghostty view) | Mode B park dump |
| Roles untouched | Roles OK |
| No dual-mon thrash | **Fallback worked:** all three soft-parked to last mon last group (mon1 chrome TABBED) |

## Goal

When the desk is “roles correct mon + user stacked a few companions under a
role VSPLIT/HSPLIT,” **Mode A** should:

1. Keep `thrashState.thrashed === false` (or low score) for this class.  
2. Assign Nautilus → left term view; FB+Chess → right term view.  
3. Structure-tab each view (Ghostty + marginals) as TABBED.  
4. Second `workon` → nothingToDo.

Mode B remains for true chaos (wrong-mon, multi-role tabbed not grouped, excess mon-children).

## Acceptance

- [x] Pre-apply fixture: mon0 VSPLIT(ghostty, nautilus) | mon1 VSPLIT(ghostty,
      VSPLIT or siblings FB/Chess) | roles OK → Mode A collect, not Mode B park  
- [x] Post-apply / second plan nothingToDo for roles  
- [x] True thrash fixture still Mode B  
- [ ] Live black re-run: same sequence → term tabs, not all dump to chrome  
- [x] tests + task/plan notes  

## Non-goals

- Changing Mode B dump target  
- Session H1  
- Profile sugar rewrite unless view ids block collect  

## Session note

**Shipped (Task Force A):**

1. **`detect_thrash`:** `nested-split-view` only when profile view is **multi-role
   tabbed**. Single-role term + nested H/V companions is **not** thrash (Mode A).
2. **`_build_slot_membership`:** mon-child **containment** — unclaimed window
   under a mon-child index owned by a claimed role → that slot (covers nested
   CON under term, not only CON siblings / rect).
3. **Fixtures:** `tree-live-pre-nested-con-companions.json`,
   `tree-thrash-mode-b-companions.json` (true Mode B park),
   `tree-thrash-comms-nested-hsplit.json` (multi-role nested-split thrash).
   Former Mode B nested-term fixture → Mode A collect.
4. **Tests:** `TestModeANestedCompanions` + matrix/TZ-recover/safe updates.
   `python3 -m pytest tests/unit/cli/test_workon_plan.py -q` → **104 passed**.

**Live black re-run** still user acceptance (install trial).
