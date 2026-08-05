# Task: forge-layout-control-loop_cl0-request-api

**Status:** ready  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05

## Goal

Land the **request layout / request verify** skeleton and locked terminology so
later CL slices plug into one debounce path. No Ghostty live fix required in CL0
alone (CL4 is acceptance for sole Ghostty).

## Acceptance

1. **Glossary** written into plan (already) + short note in `docs/dev/architecture.md`
   or `docs/DESIGN.md`: mutate vs compute slots vs commit/render vs verify vs rebuild
   vs monitor-recovery (legacy soft-rehome name OK in one “formerly” line).
2. **`requestLayout(reason)`** on WindowManager (or tiny helper module used by WM):
   trailing debounce **150–300ms** (constant named, e.g. `LAYOUT_REQUEST_DEBOUNCE_MS`);
   coalesces multiple reasons; eventually calls existing `renderTree` once.
3. **`requestVerify(reason)`** skeleton: trailing debounce; calls a **stub or real
   no-op verify** that can log in debug — full scanner is CL1, but API must exist
   and be unit-tested for coalesce/reset.
4. **After successful renderTree body**, schedule `requestVerify("post-render")`
   (or direct scheduleVerify) so the hook is in place for CL1.
5. **Unit tests:** multiple rapid `requestLayout` → single render; verify debounce
   coalesce; no soft-rehome rename in this task.
6. **`npm test`** green for new + related unit tests.
7. Do **not** replace createDelay / open path yet (CL4). Do **not** rename soft-rehome.

## Out of scope

- App thrash catalog (CL3)
- Open = batch N (CL4)
- Layout CLI batch (CL5)
- monitor-recovery rename plan

## Session note

(ready — not started)

**Git:** Unrelated `plan/forge-wayland-live` WIP is in `git stash` (message mentions rival-tilers / soft-rehome / install scripts). Agents own that stash — see `agents/HANDOFF.md`. Do not `stash pop` onto this branch; do not `stash drop` it.
