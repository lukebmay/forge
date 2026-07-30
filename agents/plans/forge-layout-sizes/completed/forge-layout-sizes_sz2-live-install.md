# Task — SZ2: Live black smoke + install/session size audit

**Status:** done (B AGREE — await orchestrator wrap-up commit)  
**Plan:** [forge-layout-sizes.md](../plans/forge-layout-sizes.md)  
**Branch:** `plan/forge-layout-sizes`  
**Priority:** P1  
**Kind:** Plan-linked  
**Depends on:** SZ1 (AGREE)  

## Goal

Prove custom shares survive on machine `black`: layout save/load and
install/session track. Fix any live gaps found (small patches OK).

## Acceptance

1. **Live resize → save:** Resize a mon-level HSPLIT (userSized),
   `forge layout save` (or `--stdout`) includes `share` with unequal values. **PASS**
2. **Live load:** Apply that profile (or a hand-authored share profile against
   existing apps); GetTree shows percent ≈ shares and userSized true on those
   siblings (±0.02). **PASS** (8/8 size + 6/6 layout after fixes)
3. **Install/session audit:** Confirm session-layout portable path still
   writes/restores percent+userSized (code path + optional save-session-layout
   round-trip). No wipe of userSized on soft rehome descriptors. **PASS**
4. **Equal still clean:** Equal desk save does not force share noise. **PASS**
5. Unit tests still green after any fixes. **PASS** (1950 vitest + 272 pytest)
6. Debug install if extension code changed: `./install` with logging if needed;
   user said they will not interfere with windows. **PASS**

## How to live-test (black)

```sh
# After install of this branch:
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 4

# Resize mon0 split (keyboard expand or mouse), then:
forge tree | jq '.monitors[0].children[] | {percent,userSized,wmClass,layout}'
forge layout save sz-smoke --stdout --no-description
# Apply share profile / reload layout and re-check tree percents
```

Prefer existing open windows (Chrome/Ghostty). Do not kill user session lightly;
HUP only if install requires it.

## Out of scope

- Full docs (SZ3)
- yuiop / auto-tile

## Session note

**SZ2 Task Force B (2026-07-29): AGREE**

Branch `plan/forge-layout-sizes`; uncommitted (orchestrator wrap-up).

### Code review
1. **`computeSizes` userSized skip** — Correct. Min paint still adjusts pixel
   `sizes[]`; only percent write-back is skipped when any sibling is
   `userSized`. Preserves intentional shares for save/load/session. Paint is
   not left min-unaware.
2. **`_suppressEnteredMonitorRehome` during `tree.apply`** — Correct and
   scoped. Flag only around paint `move`/`move_resize_frame`; nested-safe
   (`prev` + `finally`). Real user/monitor rehomes (drag, keybind,
   workspace reconcile) do not go through this window. Spurious enter during
   paint would otherwise rehome one mon child and
   `redistributeSiblingPercent` scale the survivor to percent=1.
3. **Session path** — `session-layout.js` / `tree-snapshot.js` already carry
   percent+userSized; no wipe on soft rehome descriptors. SZ2 install audit
   claim holds in code.

### Collateral hunt
- Suppress too broad? **No** — only mid-apply; same pattern as thrash /
  session restore / shield.
- Min paint wrong after skip? **No** — return sizes still min-adjusted.
- Partial `_sizeOp` renormalize when unmentioned siblings have percent>0 can
  dilute shares — planner always sizes full sibling sets; residual only.

### Live (B, light)
- `forge tree`: mon0/1 percent 0.5 + userSized present
- `forge layout save … --stdout`: bare pane lists (equal → no share noise)

### Tests (B re-ran)
- vitest: t4-sizing-policy 6, run-steps 25, resize + h1 soft-rehome related,
  full `tests/regression` **502** pass
- pytest layout save/plan/apply: **272** pass

### Residual for SZ3 / wrap-up
- Optional unit test: suppress rehome while `_suppressEnteredMonitorRehome`
- SZ3 docs + layout help sugar line
- Orchestrator: local commit SZ1+SZ2 on plan branch (no push)
