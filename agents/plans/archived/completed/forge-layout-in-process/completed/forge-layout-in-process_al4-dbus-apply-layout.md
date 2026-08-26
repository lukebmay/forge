# forge-layout-in-process_al4-dbus-apply-layout — ApplyLayout DBus stub

**Status:** done (L0 + code; nest live blocked this session)  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** grok-4.5. Named APIs. No planner port.

## Goal

Land the DBus surface + single-flight run bag + R027 chrome
lifetime. Executor may be a stub that emits phases and Done.

## Acceptance

- [x] SessionApi methods: `ApplyLayout`, `GetLayoutApply`,
      `CancelLayoutApply`
- [x] Signals: `LayoutApplyProgress`, `LayoutApplyDone` (JSON `s`)
- [x] Immediate return (no blocking spine)
- [x] Single-flight: second start → `code=busy` + existing applyId
- [x] Disconnect does not cancel; `CancelLayoutApply` does
      (cooperative); unwind chrome clear (batch not begun in stub)
- [x] Chrome show at start (incl. no-open); clear on terminal;
      safety cap = apply lifetime (`LAYOUT_APPLY_RUN_HARD_MS` 300s)
- [x] `SESSION_API_VERSION` bumped to **10**
- [x] Units for parse / busy / cancel unwind / chrome hardMs re-arm
- [x] No `layout_plan.py` port; stub does not call `planReconcile`
- [x] Host live gdbus smoke — **PASS** 2026-08-15 after Wayland restart
      (`apiVersion` 10; ApplyLayout stub → phases → terminal Done;
      second start after Done OK). Nest optional (not required for AL4).

## Context for the next agent (complete + succinct)

- Bag: `lib/extension/layout-apply-run.js` (`LayoutApplyRunBag`, pure parse/payloads)
- Wire: `lib/extension/session-api.js` (XML methods+signals, `_ensureLayoutApplyRuns`)
- Chrome: `showForApplyRun` / `bumpApplyRunHardClear` / `restoreBatchHardMs` on
  `LayoutApplyChrome`; controller `setHardMs` + `resetHardClear`
- Batch chrome still `LAYOUT_APPLY_CHROME_HARD_MS` (30s)
- Stub walks `APPLY_LAYOUT_PHASES` via GLib 0ms timeouts; AL5 fills work
- Tests: `tests/unit/extension/layout-apply-run.test.js` (13)
- Disk tip after install: `…-dirty` (uncommitted AL1+AL4); host Shell still
  pre-AL4 until nest reload or logout

```bash
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-chrome.test.js
# After nest works / host logout:
# gdbus call … ApplyLayout '{"profile":{"roles":[]},"name":"stub"}'
# forge ping  # apiVersion >= 10
```

## Session note

**2026-08-15:** AL4 stub landed with AL1. L0 green. Nest socket not ready
(display :1 auth). Prefer nest retest when nest works; host logout also
loads tip. Next: AL2 normalize pure (or AL3) while nest broken is OK.
