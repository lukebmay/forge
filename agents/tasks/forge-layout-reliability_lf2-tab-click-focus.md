# forge-layout-reliability_lf2-tab-click-focus

**Status:** in progress  
**Plan:** [forge-layout-reliability.md](../plans/forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

Tab strip clicks always focus/raise the target window without a prior dock or
content click.

## Symptom

Sometimes a tab click does nothing useful for focus; operator must click the
app's **dock item** first, after which tab focus works again.

## Scope

- `_activateFromTab` / tab button handlers (`tree.js`)
- `updateTabbedFocus` / decoration restack (`focus.js`, processNode)
- Post-layout / RunSteps settle (WR14) leaving chrome unpickable or windows buried
- Multi-mon focus: focus on other mon, then click tab

## Non-goals

- LF1 mon/open/active (separate task).
- Redesign of tab chrome visuals.

## Acceptance

- [ ] Primary-click on tab activates + focuses that leaf without dock priming.
- [ ] Root cause written in session note (stacking, race, frozen render, etc.).
- [ ] Regression coverage where feasible (unit/e2e); else minimal reliable repro notes.
- [ ] `docs/user/troubleshooting.md` only if user-facing steps change.

## Session note

*(overwrite each session)*

Filed from user report 2026-07-29. Queue after LF1 unless investigation is cheap.
