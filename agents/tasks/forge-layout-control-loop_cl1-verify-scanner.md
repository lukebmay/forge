# Task: forge-layout-control-loop_cl1-verify-scanner

**Status:** ready  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05

## Goal

Replace the CL0 verify **stub** with a real **Meta ↔ tree slot** scanner plus an
**agreement counter** so a forest can become SETTLED only after ≥2 consecutive
full agreements (plan defaults). Wire it into the existing debounced
`requestVerify` path; post-render already schedules verify (CL0).

## Acceptance

1. **Pure helpers** (unit-testable without live Meta):
   - Frame↔slot agreement within ε (default **4px** on x/y/width/height), named constant
     e.g. `LAYOUT_VERIFY_EPSILON_PX`.
   - Monitor match: Meta `get_monitor()` vs tree home (monitor node index / existing
     helpers — follow how TREE stores mon for a WINDOW node).
   - Result shape suitable for tests: per-window ok/mismatch reasons; forest-level
     all-agree boolean.
2. **Agreement counter** on LayoutController (or tiny companion module):
   - On full agreement: increment; when ≥ **2** consecutive → mark SETTLED (API/state
     readable for tests/debug).
   - On any mismatch: agreement = 0; not settled.
   - `markUnsettled(reason)` (or equivalent) resets agreement to 0 — CL2 will call
     this from external geometry; export now and unit-test.
   - Consecutive passes should be separated by the verify debounce / fire path
     (do not count the same fire twice). Plan `verifyDelayMs` ~300ms is **between
     settled double-checks** — either use a second verify reschedule when agreement
     is 1, or document that two distinct `requestVerify` fires after quiet are enough
     for CL1; prefer **auto-reschedule one extra verify** after first agreement so
     post-render alone can reach SETTLED without external callers.
3. **Scanner walks managed TILE leaves** (alive Meta, not GRAB_TILE mid-drag carve-outs
   as reasonable): compare slot (`renderRect` or applied rect) vs `get_frame_rect()`.
   Floats: skip slot force (mon-only optional; can skip floats entirely in CL1).
4. **Wire into** `LayoutController` verify fire (replace stub body): run scan → update
   agreement → if mismatch, **do not** auto-correct yet beyond optional single
   `requestLayout("verify-mismatch")` **once** per mismatch wave (avoid infinite
   layout↔verify loops: e.g. only requestLayout if not already pending and
   agreement was >0 or first mismatch after settle; or only log + expose
   `lastVerifyResult` in CL1 and leave correct to CL2 — **prefer:** on mismatch set
   unsettled + `requestLayout("verify-mismatch")` at most once until a later
   successful full agreement or cancel; unit-test no storm of infinite requests with
   fake always-mismatch).
5. **Unit tests** (high value — user asked for thorough testing):
   - ε compare: exact match, within 4, outside 4, null rects.
   - mon mismatch alone fails agreement.
   - agreement 0→1→2 SETTLED; mismatch resets; markUnsettled resets.
   - post-render path can reach SETTLED with auto second verify when all match.
   - mismatch does not infinite-loop requestLayout (cap / latch).
   - Floats / dead windows skipped.
6. **`npm test`** green.
7. Do **not** implement full external size-changed routing (CL2), thrash catalog
   (CL3), open-path batch (CL4), or soft-rehome rename.

## Out of scope

- CL2 sensor attribution / suppress integration (beyond exporting markUnsettled)
- Ghostty live (CL4/CL7)
- Periodic 5s rescan gsetting (CL6)

## Implementation hints

- Prefer pure functions in `layout-controller.js` or `lib/extension/layout-verify.js`
  for compare + scan input as plain rect/mon structs so tests need no full WM.
- Slot source: WINDOW node `renderRect` if set, else `rect` if that is the applied slot.
- Existing move() skips on exact frame equality — verify uses ε for client jitter.
- Logger.debug for mismatch summaries when logging enabled.

## Session note

(ready — not started)

**Git:** Stay on `plan/forge-layout-control-loop`. Leave wayland-live stash alone.
