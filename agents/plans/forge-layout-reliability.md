# Plan: Layout reliability (tab focus + partial reopen)

**Status:** active — **LF5 + OP2 A done (await B)**  
**Priority:** **P0** daily-driver on `black`  
**Updated:** 2026-07-29  
**Related:** [forge-workon-thrash-zero.md](./forge-workon-thrash-zero.md) (historical),
[layout-mon-claim-order](../tasks/layout-mon-claim-order.md) (superseded by LF1),
tab chrome / session focus archive entries

### Session note (2026-07-29 Task Force A — LF5 + OP2)

| Issue | Status |
| --- | --- |
| SI1 install snapshot focus | shipped (A/B) |
| LF4 multi-instance Ghostty open | shipped; live still needed settle |
| **LF5** settle before layout move | **A done** — await B |
| **OP2** dock second Ghostty tile | **A done** — await B |

**LF5 root:** open wait returned on class appear while still FLOAT; residual Move
too early. **Fix:** `window_is_settled` + settle poll in `wait_for_wm_class` and
before residual/belt moves.

**OP2 root:** dock appId `.desktop` mismatch; firstRender skipped by lone-max
apply filter; long FLOAT gap. **Fix:** normalize dock app ids; always place
firstRender; dock create queue 50ms.

**Tests:** pytest cli **307**; vitest extension/window/tree **934**. No commit
until B. Live re-verify on black after install.

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
| **LF5** | [forge-layout-reliability_lf5-settle-before-move](../tasks/forge-layout-reliability_lf5-settle-before-move.md) | **A done** (await B) |
| **OP2** | [forge-layout-reliability_op2-dock-second-tile](../tasks/forge-layout-reliability_op2-dock-second-tile.md) | **A done** (await B) |

## Prior work feeding LF1

| Change | Note |
| --- | --- |
| `eab4d8b` two-pass mon claim | Necessary but not sufficient; LF1 fixed open residual + mon ensure + survivor focus |
| [layout-mon-claim-order](../tasks/layout-mon-claim-order.md) | Incomplete vs live; closed by LF1 code path |
| Focus/active index sugar | Explicit `active` still wins; bare reopen uses survivor rule |
