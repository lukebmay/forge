# TZ-mode-a-nested — Mode A collect under role VSPLIT (live residual)

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Ready (next session)  
**Priority:** P0 residual after thrash-zero ship  
**Depends:** TZ-collect + TZ-detect shipped  
**Task force:** A implement → B verify  

## Live evidence (black, 2026-07-27)

**Setup:** original `dev` desk → Nautilus below **left** Ghostty → Facebook +
Chess under **right** Ghostty → `forge workon dev`.

| Expected (Mode A) | Actual |
| --- | --- |
| Nautilus tab into mon0 term (left Ghostty view) | Mode B park dump |
| FB + Chess tab into mon1 term (right Ghostty view) | Mode B park dump |
| Roles untouched | Roles OK |
| No dual-mon thrash | **Fallback worked:** all three soft-parked to last mon last group (mon1 chrome TABBED) |

**Post-apply forest** (Mode B outcome): roles on correct mons; mon1 right
TABBED holds Gmail | Voice | YouTube | Chess | Facebook | Nautilus; each
Ghostty alone in a mon-child VSPLIT. Fixture:
`tests/unit/cli/fixtures/workon/tree-live-mode-b-park-after-nested.json`
(apiVersion may be 1 from live GetTree — normalize if tests need v2).

Ideal collect failed; thrash **fallback** (Mode B) succeeded — product not
DOA, but morning cleanup is wrong bag.

## Hypothesis (verify in implement)

**Probe (reconstructed pre + `profile-dev-v2`):** `thrashed=false`, Mode A
structure `mon0.term` `[ghostty, nautilus]` + `mon1.term` `[ghostty, fb, chess]`
— ideal plan already. So either live **pre-tree** differed, or **black host
profile** (`~/.config/forge/workon/hosts/black/dev.json`, slots like
`mon0.s0` / `mon1.ghostty-right` / `mon1.s0`) changes detect/collect, or
apply path failed after a good plan.

1. Repro with **black host profile** + reconstructed pre fixture first.  
2. **Thrash detect too hot** on live IR ids / nested VSPLIT under mon-child.  
3. Collect assign wrong view (chrome half) under live rects.  
4. Plan Mode A but apply moved/parked wrong (extension flatten / step order).

## Goal

When the desk is “roles correct mon + user stacked a few companions under a
role VSPLIT/HSPLIT,” **Mode A** should:

1. Keep `thrashState.thrashed === false` (or low score) for this class.  
2. Assign Nautilus → left term view; FB+Chess → right term view.  
3. Structure-tab each view (Ghostty + marginals) as TABBED.  
4. Second `workon` → nothingToDo.

Mode B remains for true chaos (nested thrash mon1 fixture).

## Acceptance

- [ ] Pre-apply fixture: mon0 VSPLIT(ghostty, nautilus) | mon1 VSPLIT(ghostty,
      VSPLIT or siblings FB/Chess) | roles OK → Mode A collect, not Mode B park  
- [ ] Post-apply / second plan nothingToDo for roles  
- [ ] True thrash fixture still Mode B  
- [ ] Live black re-run: same sequence → term tabs, not all dump to chrome  
- [ ] tests + task/plan notes  

## Non-goals

- Changing Mode B dump target  
- Session H1  
- Profile sugar rewrite unless view ids block collect  

## Session note

(next agent fills)
