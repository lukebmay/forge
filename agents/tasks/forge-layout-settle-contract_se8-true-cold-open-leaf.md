# forge-layout-settle-contract_se8-true-cold-open-leaf — Chrome over Grok on true cold open

**Status:** ready  
**Plan:** [forge-layout-settle-contract](../plans/forge-layout-settle-contract.md) (task **SE8b**)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09  
**Regression:** R008 (extend R005/R007)  
**Note:** Plan row **SE8** is CT3 smoke; this task is **SE8b** (true cold open leaf).

## Goal

One `forge layout dev` from a **true cold** desk (no Chrome/PWA; agent only in
**Guake** or after full close) leaves mon0 TABBED **open leaf = Grok** (not plain
Chrome New Tab) and mon1 open leaf = YouTube; profile keyboard focus sticks
(left ghostty when profile says so).

## Acceptance

- [ ] **Repro locked** with logging: true cold X11, agent in Guake; capture
      verbose apply log + tree before/after; mon0 `lastTabFocusId` ≠ Grok
- [ ] Named phase that failed (soft barrier | pin | post-settled verify | raise
      without lastTabFocus rewrite | decoration hide | late map after verify)
- [ ] Architecture fix in that phase — **no** personal-layout branches; **no**
      “sleep more and hope”
- [ ] Instrumentation kept or demoted: layout apply log fields and/or debug
      Logger lines for pin set/restore, soft residuals, finalFocusVerify needed
- [ ] Unit/pure guard for the failure class (extend pin / still_needed / soft
      barrier tests as appropriate)
- [ ] Live green: true cold Guake path + partial matrix (ghosttys-only, left
      chrome, right ghostty) still green
- [ ] REGRESSIONS.md R008 row + HANDOFF update

## Context for the next agent (complete + succinct)

### Proven

- Profile data is correct: `active: Grok`, `active: YouTube`, `focus: ["ghostty", 0]`
  under `$FORGE_LAYOUT_DIR/hosts/black/dev.json`.
- R007 shipped: open-leaf `keyboard: false`, always soft final focus, cold soft
  floor 2s with pins, RunSteps `keyboard` passthrough.
- **Partial** ghosttys-only (close Chrome, keep Ghostty) was green after R007
  with softTimeoutMs=2000 and correct leaves.
- **Live desk after human reinstall (2026-08-09):** mon0 `lastTabFocusId` still
  **New Tab Chrome**, mon1 YouTube OK, focus on Guake/YouTube thrash — **true
  cold still broken** for mon0 open leaf.

### How to repro (agent in Guake — preferred)

```bash
# Close all tiled apps (or forge layout clean once CE1 works)
# Keep Guake only
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 4
forge layout dev --verbose > /tmp/layout-true-cold.json 2> /tmp/layout-true-cold.err
forge tree > /tmp/tree-after-cold.json
# Fail if mon0 TABBED lastTabFocusId title is not Grok
```

### Debug hooks to add if needed

| Layer | What |
| --- | --- |
| CLI `apply_log` | Already has `finalFocus*`; ensure soft residuals + verify `neededRoles` always printed on `--verbose` |
| Extension | `pinLayoutOpenLeaf` / `restoreLayoutOpenLeafIfStolen` Logger.info when pin set/hit/miss/expired |
| GetTree | `lastTabFocusId` already exported — compare mid soft barrier if needed via poll dumps |

### Hypotheses to falsify (order)

1. Soft barrier settles clean before first chrome late-activate; pin expires or never set on mon0 CON.
2. Pin restore raises Grok but something rewrites `lastTabFocus` after pin window without meta-focus path.
3. True cold bind/order leaves chrome as first tab child and ensure_layout/settle adopts chrome before focus phase.
4. `_settleAfterRunSteps` after residual structure stomps open leaf after final focus.
5. Chrome visual “on top” with correct lastTabFocus (raise race only) — still treat as fail if user sees Chrome content.

### Paths

- CLI focus: `scripts/forge/forge` `_layout_final_focus_pass`
- Soft/pin pure: `scripts/forge/layout_apply.py`, `lib/extension/layout-open-leaf-pin.js`
- Focus op: `lib/extension/session-api.js` `_focusOp`
- Meta steal: `lib/extension/action-pipeline.js` `afterFocus`, `window.js` focus handler
- Plan focus: `layout_plan.py` `_focus_actions_from_profile`

### Risks

- Band-aid reassert loop; personal Grok/Chrome branches; breaking mid-session no-open path.

## Session note

2026-08-09: Task filed after human reinstall + Guake agent; mon0 still Chrome open leaf live.
