# forge-layout-first-apply-float — first `forge layout` leaves FLOAT

**Status:** in progress
**Plan:** (none) — R024 residual
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Operator: **same issue persists** — `forge layout dev` starts **all**
windows in FLOAT, then a second `forge layout dev` tiles them.

R024 claimed to fix this (RunSteps always force-paint; batch end
`processFloats` + force; `renderTree(force)` cancels stale idle).
Either tip is not loaded, or the fix is incomplete.

## Acceptance

- [ ] Named phase that still fails (skeleton / open / bind / hard-ready /
      residual / host-not-on-tip)
- [ ] If host Shell is not on tip: say so; do **not** re-patch R024
- [ ] If a remaining skip path exists: fix that contract; delete any
      new crutch; L0 regression
- [ ] One `forge layout` (test profile or `dev` smoke) ends with TILE
      modes + slot geometry — second call not required

## Context for the next agent (complete + succinct)

### Proven

- R024 shipped 2026-08-13. Code comments in
  `lib/extension/session-api.js` (~742) and `lib/extension/window.js`
  (~2150, ~2278). Guard:
  `tests/regression/bug-r021-r024-open-drop-layout.test.js` R024
  section. Live: `L1.r024-first-layout-tiles` in
  `scripts/forge/live_matrix.py`.
- Architecture: apps map FLOAT then TILE; hard-ready waits ~5s for
  TILE before move. “Second layout fixes it” was the R024 class:
  first apply skipped `commitLayout` (leftover drag freeze / stale
  idle `renderTree`).
- Host is Wayland. Tip loads via `./install` + nest **or** one logout.
  HANDOFF residual: “Load tip then smoke R021–R024.”

### Diagnose first (do not blindly re-code R024)

1. `echo $XDG_SESSION_TYPE`; `forge test live probe`
2. Whether host extension is this tree’s tip (install UUID / log /
   `forge ping` version vs `git log -1`). If not on tip: **stop
   coding**; write that in the session note. Operator must nest or
   logout.
3. `forge tree` after **one** `forge layout` (prefer `_forge-test-*`
   if a safe fixture exists; operator reproduces on `dev`). Inspect
   WINDOW `mode`. If already TILE after one apply on tip → host-not-on-tip
   was the report.
4. If still FLOAT on tip: find the skip. Candidates:
   - leftover freeze / idle render still dropping force
   - `wait_until_hard_ready` timing out; moves no-op on FLOAT
   - `processFloats` not running at batch end for this path
   - CLI thinks success while GetTree still FLOAT
   - RunSteps vs `layout apply` different commit path

### Rules

- Name the **phase**. Fix that contract. No “run layout twice” product.
- No personal-layout branches. No Mode B as cold success.
- L0 before live. Nested `run` if you change JS. Stop nest when done.
- Do not close the agent TILE. Do not force-push. Do not commit.

### Enable / test

```bash
npm test -- tests/regression/bug-r021-r024-open-drop-layout.test.js
# If JS changed:
./install && forge nested run -- forge ping
forge nested status   # running: False
```

## Session note

**2026-08-13 diagnose (read-only):** **host-not-on-tip.** R024 is in
git HEAD and on disk (`v49-90-beta.2-300-g80f5475`). Wayland install
`20260813T192435Z-c99286` failed live reload (“must log out”). Same
login then `dev` 19:28:16 failed hard-ready (7/7 timeout,
`layoutBatchEnd committed: false`); 19:28:31 Mode B “ok.” Chrome
scope from that install still alive — no logout since.

**Do not re-patch R024 freeze/force.** Next: load tip (logout **or**
nest for JS). Only if smoke still FLOAT after tip: `endOpenLayoutBatch`
still gates force-paint on `step.shouldCommit` while the comment says
always force. Extend R024 unit for `needsCommit=false`.

Zoom implementer owns nearby `window.js` until it lands — then a
tiny follow-up if we want the `shouldCommit` hole closed before
logout smoke.
