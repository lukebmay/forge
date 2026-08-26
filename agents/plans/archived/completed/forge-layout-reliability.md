# Plan: Layout reliability (tab focus + partial reopen)

**Status:** **shipped** (LF6 live OK on black)  
**Priority:** historical / keep LF6 until [settle-pure](./forge-layout-settle-pure.md)  
**Updated:** 2026-07-29  
**Related:** [forge-workon-thrash-zero.md](./forge-workon-thrash-zero.md) (historical),
[layout-mon-claim-order](../tasks/layout-mon-claim-order.md) (superseded by LF1),
tab chrome / session focus archive entries

### Session note (2026-07-29)

**LF8 done (live PASS):** nested vsplit apply — mon-direct anchors only;
`destWindowId` + PlaceNext `attachSelector` (`do_launch`); mon0.s1 ensure
vsplit. Close nautilus → `forge layout t1` restores under left ghostty (twice).
Unit 261 pass. See
[completed/…_lf8](./forge-layout-reliability/completed/forge-layout-reliability_lf8-nested-vsplit-apply.md).

**LF7 done (A/B AGREE):** mon-root VSPLIT save emits `{vsplit: panes}`; bare pane
lists stay hsplit. Nested-under-mon is LF8.

**LF6 live OK (user 2026-07-29):** open all → whole-tree stable → residual rehome
batch works for close chrome + right Ghostty. Jumpiness remains → new plan
[forge-layout-settle-pure.md](./forge-layout-settle-pure.md) (D0 discussion).


---


## Why

A single bad `forge layout dev` after closing a couple of windows, or a tab that
ignores clicks until the dock is used, makes the product feel unfinished on the
daily driver. These are **correctness** bugs, not sugar polish.

## Locked host context

| Item | Detail |
| --- | --- |
| Host | `black` — dual 4K, X11, Shell 46 |
| Profile | `~/.config/forge/layout/hosts/black/dev.json` bare array |
| mon0 | `tab(google-chrome, Grok) \| ghostty` |
| mon1 | `ghostty \| tab(YouTube, Gmail, Google Voice)` |

---

## User issues (filed 2026-07-29)

### LF1 — Partial reopen thrash + wrong active

**Repro (black):**

1. Start from a clean `forge layout dev` desk (or equivalent).
2. Close **left** (mon0) Ghostty.
3. Close **google-chrome** (leave Grok if it was tabbed with Chrome).
4. Run `forge layout dev` again.

**Observed:**

| Symptom | Detail |
| --- | --- |
| Chrome tab rejoin | google-chrome is added to the mon0 tab group **correctly** |
| Grok not active | Grok is **not** the open/active leaf as expected after load |
| Ghostty wrong mon | New Ghostty appears on the **right** (mon1 becomes **3-unit hsplit**) instead of the **left** (mon0 stays **1 unit**) |

**Hypothesis (investigate; do not assume only one root):**

1. **Open placement:** mon0 Ghostty is planned as `open`, but PlaceNext / launch
   attaches on the focused or mon1 monitor → residual replan builds 3-pane mon1.
2. **Claim residual:** two-pass claim unit tests pass (`eab4d8b`) but live path
   (detect / residual after open / mon ensure) still steals or mis-anchors.
3. **Active / lastTabFocus:** bare-array profile has no explicit `active` /
   `focus`; re-open of Chrome steals open leaf from surviving Grok; or focus
   ops skip Grok when Chrome is still `open` mid-batch and never re-apply.

**Acceptance (LF1):**

- [x] Same repro: mon0 ends `tab(chrome, Grok) | ghostty` (2 mon children), mon1
      stays `ghostty | tabs` (not 3-unit hsplit from extra Ghostty). *(unit + dry-run)*
- [x] mon0 Ghostty is **opened/placed on mon0**; mon1 Ghostty is **reused** (no
      steal). *(unit)*
- [x] After apply, mon0 tab open leaf is **Grok** when profile/product expects it
      (preserve surviving `lastTabFocus` and/or emit default/`active` so Grok
      wins over newly opened Chrome). Document the rule in `docs/user/layout.md`.
- [x] Unit tests for the failing plan shape (closed mon0 term + closed chrome +
      mon1 term present); optional dry-run fixture from live tree.
- [x] No regression on two-pass claim tests already green.

### LF2 — Tab click does not focus window

**Symptom:** Sometimes clicking a tab does **not** focus/raise that window.
Operator must click the **dock item** first; after that, tab focus works again.

**Related known paths:** `_activateFromTab` (`tree.js`), `updateTabbedFocus`
(`focus.js`), WR14 settle after RunSteps, decoration restack, pointer hover focus.

**Acceptance (LF2):**

- [x] Tab primary-click activates + focuses the leaf without a prior dock/content
      click (including after layout apply / multi-mon focus elsewhere). *(unit)*
- [x] Root cause documented (actor stacking, frozen render, focus signal race,
      unmapped meta, etc.) with a regression test or minimal e2e/unit where possible.
- [x] Troubleshooting note updated only if user-facing behavior changes. *(no change)*

---

## Non-goals

- STACKED product polish (SL5) — lower priority until live LF re-verify.
- Redesigning bare-array sugar syntax.
- Full thrash Mode B rewrite (already shipped).

## Task queue

| ID | Task | Status |
| --- | --- | --- |
| LF1 | [completed/…_lf1-partial-reopen](./forge-layout-reliability/completed/forge-layout-reliability_lf1-partial-reopen.md) | **done** (A/B AGREE) |
| LF2 | [completed/…_lf2-tab-click-focus](./forge-layout-reliability/completed/forge-layout-reliability_lf2-tab-click-focus.md) | **done** (A/B AGREE) |
| LF3 | [completed/…_lf3-mon1-ghostty-reopen](./forge-layout-reliability/completed/forge-layout-reliability_lf3-mon1-ghostty-reopen.md) | unit; live → LF4/LF5 |
| SI1 | [completed/…_si1-install-snapshot-focus](./forge-layout-reliability/completed/forge-layout-reliability_si1-install-snapshot-focus.md) | **done** (A/B) |
| LF4 | [completed/…_lf4-ghostty-open-mon](./forge-layout-reliability/completed/forge-layout-reliability_lf4-ghostty-open-mon.md) | unit; **live fail → LF5** |
| LF5 | [completed/…_lf5-settle-before-move](./forge-layout-reliability/completed/forge-layout-reliability_lf5-settle-before-move.md) | **done** (A/B; live re-verify) |
| OP2 | [completed/…_op2-dock-second-tile](./forge-layout-reliability/completed/forge-layout-reliability_op2-dock-second-tile.md) | **done** (A/B; live re-verify) |
| LF6 | [completed/…_lf6-open-then-stable-rehome](./forge-layout-reliability/completed/forge-layout-reliability_lf6-open-then-stable-rehome.md) | **done** (A/B; live re-verify) |
| LF7 | [completed/…_lf7-vsplit-save](./forge-layout-reliability/completed/forge-layout-reliability_lf7-vsplit-save.md) | **done** (A/B AGREE) |
| LF8 | [completed/…_lf8-nested-vsplit-apply](./forge-layout-reliability/completed/forge-layout-reliability_lf8-nested-vsplit-apply.md) | **done** (live PASS) |

## Prior work feeding LF1

| Change | Note |
| --- | --- |
| `eab4d8b` two-pass mon claim | Necessary but not sufficient; LF1 fixed open residual + mon ensure + survivor focus |
| [layout-mon-claim-order](../tasks/layout-mon-claim-order.md) | Incomplete vs live; closed by LF1 code path |
| Focus/active index sugar | Explicit `active` still wins; bare reopen uses survivor rule |
