# Task: layout focus reassert, apply chrome duration, session-sleep redesign

**Status:** done (implement A)  
**Plan:** (standalone)  
**Branch:** `task/layout-focus-chrome-session-sleep`  
**Created:** 2026-08-08  

## Goals

1. **Focus reassert:** Remove `_reassertTabStackSiblingSlots` from hot tab/stack focus path (`updateTabbedFocus` / `updateStackedFocus`) unless a clear correctness need remains. Prefer raise + `lastTabFocus` only. Keep helper for verify/recovery if called elsewhere with mode `all`/`force`. Update tests/comments/DESIGN if needed. Operator saw Gmail/Voice PWA flicker on first focuses after re-open — reassert was the suspect.

2. **Layout apply chrome spinner (~4s):** Chrome (dim + spinner) stays through residual place today. Clear it as soon as opens/map-pins settle and LayoutBatch ends — **before** residual place/structure. Hard ≤30s timeout remains. Document why residual no longer needs the overlay. Unit/CLI path that issues `chrome-clear` must still clear on error.

3. **shellrc `session-sleep` redesign** (`~/dev/me/shellrc`):
   - Document GNOME states: idle timer, screensaver lock, blank/dark screens, DPMS monitor off, suspend.
   - **Testing API** (default immediate): force blank, lock, monitor-sleep/DPMS off, suspend; support sequences like `session-sleep blank --delay=1s lock --delay=5s suspend` or equivalent.
   - **Settings API** (separate): set/show/restore real gsettings timeouts without mixing into the test fire path.
   - Follow shellrc `scripting.md` (help, version, deps, TTY confirm / `--force`).

4. **Close** `agents/blockers/B-manual-black-session-verify.md` → completed (operator: layout OK; DPMS deferred to session-sleep later).

## Acceptance

- [x] Focus path does not `move_resize` / reassert on tab switch (raise only)
- [x] `layout dev` chrome clears at batch end (not after residual); residual still runs
- [x] `session-sleep --help` explains states + test vs settings; sequence works
- [x] B-manual closed
- [x] Relevant unit tests green (`focus` / apply chrome / layout CLI as touched)

## Non-goals

- Full DPMS live verify (operator later)
- DnD indicators plan (next taskforce series)

## Session note (overwrite)

**Shipped (Task Force A):**

| Area | Change |
| --- | --- |
| Focus | `updateTabbedFocus` / `updateStackedFocus`: lastTabFocus + raise only; `_reassertTabStackSiblingSlots` kept but not on hot path |
| Chrome | CLI `chrome-clear` right after LayoutBatch end (before residual); finally if still needed; hard 30s unchanged |
| session-sleep | v2.0.0 shellrc: testing vs settings API; sequences + `--delay`; GNOME state machine in help |
| B-manual | → `agents/blockers/completed/`; PRIORITY/HANDOFF updated |

**Tests:** vitest FocusManager + WindowManager-focus + session-api-layout-cycle + layout-apply-chrome: **80 pass**. pytest CLI layout subset: **422 pass**. `zsh -n` session-sleep OK.

**Branch:** forge `task/layout-focus-chrome-session-sleep`; shellrc `master`.
