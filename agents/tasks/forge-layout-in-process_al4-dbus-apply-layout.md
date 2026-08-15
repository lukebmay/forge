# forge-layout-in-process_al4-dbus-apply-layout — ApplyLayout DBus stub

**Status:** ready  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none) — start after operator ack of AL0  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. Named APIs. No planner port in this slice.

## Goal

Land the DBus surface + single-flight run bag + R027 chrome
lifetime. Executor may be a stub that emits phases and Done.

## Acceptance

- [ ] SessionApi methods: `ApplyLayout`, `GetLayoutApply`,
      `CancelLayoutApply`
- [ ] Signals: `LayoutApplyProgress`, `LayoutApplyDone` (JSON `s`)
- [ ] Immediate return (no blocking spine)
- [ ] Single-flight: second start → `code=busy` + existing applyId
- [ ] Disconnect does not cancel; `CancelLayoutApply` does
      (cooperative); unwind LayoutBatch if begun + chrome clear
- [ ] Chrome show at start (incl. no-open); clear on terminal;
      safety cap = apply lifetime (not 30s)
- [ ] `SESSION_API_VERSION` bumped
- [ ] Units for parse / busy / cancel unwind / chrome lifetime
- [ ] No `layout_plan.py` port; stub need not call `planReconcile`

## Context for the next agent (complete + succinct)

- Shape: plan § DBus shape; D038
- Run state: a bag (`LayoutApplyRun` / Lifetime + SourceBag +
  SignalBag). Do not pile one-off timer fields on WM
- Chrome: `lib/extension/layout-apply-chrome.js` (R027). Batch end
  still must not clear
- LayoutBatch / RunSteps already on SessionApi — do not overload
  `LayoutBatch` to mean apply
- Parallel with AL1–AL3 (avoid editing `layout_plan.py` /
  `layout_apply.py`)
- Host job runner is **not** rewritten here

## Session note

Stubbed after AL0 lock. No work yet.
