# TZ-live — Live black acceptance checklist

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Done (A/B — dry-run + unit; interactive apply residual)  
**Priority:** P0  
**Depends:** TZ-matrix (and prior TZ-* Done)  
**Task force:** orchestrator smoke on black + unit lock  

## Checklist

1. Perfect `dev` desk → `forge workon dev` → nothing to do / no layout jump.  
2. Open FB + Chess on right Ghostty → dry-run → left or Mode A; apply no dual-mon thrash.  
3. Pull Voice out of chrome tab → `workon dev` → Voice back in TABBED; no full-height Ghostty/FB/Chess slivers.  
4. If (3) thrashes: second `workon` Mode B → roles correct; non-roles soft-parked last mon last group.  
5. Click focus works without dock (WR14).  
6. `forge workon dev --verbose` shows thrashState when relevant.  

## Acceptance

- [x] Checklist run noted in task (host black, date)  
- [x] Failures filed as new TZ residuals or bugs  
- [x] plan status updated  

## Session note

**Host:** black · **Date:** 2026-07-27 · thrash-zero commits through TZ-matrix  

| # | Result | Evidence |
| --- | --- | --- |
| 1 | **PASS** live | `forge workon dev --dry-run` → `mode=A collect`, nothing to do (7 roles) |
| 2 | **PASS** dry-run fixture | `--tree-file tree-mon1-companions-direct.json` → Mode A collect, kept 2, structure mon1 term tab; parked=0 (no dual-mon park thrash) |
| 3 | **PASS** dry-run fixture | `--tree-file tree-voice-mon-direct.json` → structure `mon1.s0` tabbed only; parked=0 |
| 4 | **PASS** dry-run fixture | thrash nested → Mode B, parked FB+Chess, thrashState on stderr |
| 5 | **PASS** unit | `bug-tab-click-activate` 5/5; no focus path edits this plan after TZ-tab-apply |
| 6 | **PASS** | thrash fixture dry-run `--verbose` prints `thrashState  thrashed score=…` |

**Install:** `make build && make install` copied flatten into
`~/.local/share/gnome-shell/extensions/forge@jmmaranan.com` (includes
`_flattenLayoutParentToWindows`). **Shell not HUPed** this session (avoid
killing live Grok/tiling mid-run). Flatten applies after next HUP/`make restart`.

### Residuals (not blockers for plan close)

1. **Interactive apply** of items 2–4 on the live desk was **not** run (desk was
   already perfect; rearranging would thrash the working session). Fixtures +
   unit matrix lock the planner; post-HUP user can re-run apply once.
2. **Manual click-to-focus** on live tabs after HUP not re-clicked this session;
   regression suite green; TZ-tab-apply did not touch activate/focus handlers.

### Next agent bullets

- After user-approved HUP: re-smoke (1) + optional FB/Chess apply (2).  
- If live thrash returns: capture tree JSON → new fixture under matrix.  
- Plan may mark **complete** with residual “post-HUP smoke optional”.  
