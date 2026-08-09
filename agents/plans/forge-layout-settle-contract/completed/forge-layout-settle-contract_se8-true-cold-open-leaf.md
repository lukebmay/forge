# forge-layout-settle-contract_se8-true-cold-open-leaf — Chrome over Grok on true cold open

**Status:** completed (verified green — no new product code)  
**Plan:** [forge-layout-settle-contract](../../forge-layout-settle-contract.md) (task **SE8b**)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09  
**Regression:** R008 (closed by live verify under R007/SE5 path)

## Goal

One `forge layout dev` from a **true cold** desk (no Chrome/PWA; agent only in
**Guake** or after full close) leaves mon0 TABBED **open leaf = Grok** (not plain
Chrome New Tab) and mon1 open leaf = YouTube; profile keyboard focus sticks
(left ghostty when profile says so).

## Acceptance

- [x] **Repro locked** with logging: true cold X11, agent in Guake; verbose apply
      + tree after — mon0 `lastTabFocusId` **is** Grok (failure class not
      reproduced on current stack)
- [x] Named phase: prior residual class was **focus / soft barrier / pin** (R007);
      true cold now uses cold soft floor 2s + pins; softSettled clean 0 corrections
- [x] No new architecture band-aid — R007 path holds for true cold
- [x] Instrumentation: `finalFocus*` verbose fields sufficient for lock
- [x] Unit: existing R007 guards; no new pure failure found
- [x] Live green: true cold Guake 2/2 + partial ghosttys-only PASS
- [x] REGRESSIONS.md R008 + HANDOFF update

## Context for the next agent (complete + succinct)

### Proven (2026-08-09 Guake X11)

| Run | Result |
| --- | --- |
| True cold #1 | mon0 Grok, mon1 YouTube; softTimeoutMs=2000; corrections=0; verify match |
| True cold #2 | same PASS |
| Post-command 20s watch | leaves stayed Grok/YouTube |
| Partial ghosttys-only | PASS (open chrome + leaves correct) |

Conversation start had mon0 LTF = Chrome New Tab **before** any layout in-session —
fixed by one mid-session `layout dev` (finalFocus applied Grok; soft 400ms no pins).
That desk residue is **not** the true-cold open path failing under current code.

### How to recheck

```bash
# Close all TILE windows; keep Guake
forge layout dev --verbose > /tmp/layout-true-cold.json 2> /tmp/layout-true-cold.err
# Expect apply.finalFocus softSettled + mon0 LTF title Grok
forge test live plan --tags R008   # L2 when can_true_cold (Guake in tree)
```

### Note on probe

Guake **dropdown hidden** may omit Guake from `forge tree` → probe reports
ghostty agent and `can_true_cold=false`. Agent may still be under Guake process
(pstree). True cold manual close of tiles still safe. Optional probe polish: AT2.

### Paths

- CLI focus: `scripts/forge/forge` `_layout_final_focus_pass`
- Soft/pin pure: `scripts/forge/layout_apply.py`, `lib/extension/layout-open-leaf-pin.js`

## Session note

2026-08-09: SE8b closed by live verify (2× true cold + partial). No code change.
R008 → verified. Next high: CE1 clean empty (shipped same session).
