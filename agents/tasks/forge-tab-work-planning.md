# forge-tab-work-planning — Tab product batch (plan before implement)

**Status:** done (planning locked 2026-08-16)
**Plan:** (none) — locks live here + [D044](../../docs/DECISIONS.md)
**Branch:** master (default)
**Blocker:** (none)
**Priority:** D0 complete. Only implement slice:
[forge-tab-groups-same-mon](./forge-tab-groups-same-mon.md).
**Updated:** 2026-08-16

## Decision lock (2026-08-16)

Gates were open: SM1–SM7 done; R036 host cold `forge layout dev` **PASS**
(chrome clear `all-hard`; mon0 TABBED(Chrome,Grok)|ghostty; mon1
ghostty|TABBED(YouTube,Gmail,Voice); place-hint sticky `move=false`).
Do **not** re-litigate D039–D043.

### 1. Chrome clear gate

**Lock:** apply overlay **is** the modal. One gate.

| Event | Overlay |
| --- | --- |
| ApplyLayout start (R027) | Show scrim + per-mon spinner; eat pointer |
| All required slots hard-done **or** hard-failed | `_clearChrome(run, "all-hard")` — D043/SM7 |
| Cancel / apply error / hard-timeout | Clear (not `all-hard`) |
| Soft residual (D019) | Runs **after** clear; must not show or keep overlay |
| Done / second clear | Idempotent |

Restack strips on clear stays (R032). Soft-enter clear is **dead**.

**Not a second gate.** “Desk looks settled” is not a user-eyeball
heuristic. If the overlay is still up, hard is not terminal — or a
leftover actor (then a **new** regression, not a retimed gate).

**Hover / tabs.** There is no tab-local spinner. Overlay covers the
stage and eats pointer until clear; then `revealGroupChild` (D025).
Long overlay after R036 is **all-hard wait** (identity / in-slot), not
tab chrome. Do **not** drop overlay earlier than all-hard.

**Group chrome A (D043 L4).** Already the existing CON strip + pane
(`decoration` / `_restackDecorationAboveGroup`). Partial A already
draws when the CON has members. Overlay hides it until all-hard.
**No new apply-time group chrome.** FCC C3 stays later (H/V split
chrome), not this batch.

**Implement:** none.

**Repro (only if overlay survives `all-hard`):**

```bash
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-chrome.test.js
forge layout dev
journalctl --user -b --no-pager | rg 'Forge.*(chrome|all-hard)' | tail -40
```

Open a regression only with journal `reason=all-hard` **and** a still-
visible `#forge-layout-apply-chrome` actor.

### 2. Cross-mon TABBED / STACKED

**Product:** **unsupported.** A TABBED/STACKED CON is **mon-local**
(one strip + one pane + one slot machine). Spanning a group across
heads is not a feature. A single Meta window spanning heads is
FLOAT/Meta — not a tab-group problem.

**Survival (keep):** H1
`alignMonitorRecoveryGroupTargets` majority-align; R016 mon-loss
collect-to-end-of-survivor as a group. Those are thrash repair, not
span chrome.

**Normalize (D044):** members of a TABBED/STACKED CON must share the
CON’s **MONITOR ancestor**. Mixed-mon is a defect. Repair = rehome
**all** WINDOW descendants onto that mon; **keep the group**; do not
auto-peel. Home = tree MONITOR ancestor — not Meta `get_monitor()`
(`sameParentMonitor` can lie mid-thrash).

| Gesture | Rule |
| --- | --- |
| DnD CENTER join across mons | Move-then-join onto **dest** mon |
| Keyboard `merge-group` | Same: dest = focus mon (today `get_tab_next` is workspace-wide) |
| Keyboard mon-move of **one** tab | Peel that **leaf** (LX3 / R022 class); remainder stays |
| Move the whole group | CON move (FCC C4 later) — not a leaf drag |
| Profile / planner | No span sugar. TABBED body stays under one mon |
| Empty-mon drop | Unchanged leaf-only (R022) |

**Implement:** [forge-tab-groups-same-mon](./forge-tab-groups-same-mon.md)
(**next**).

### 3. TD2–TD4

| ID | Verdict | One line |
| --- | --- | --- |
| TD2 | **skip** | LX4/TD1 peel is grab-tile + wrap-in-slot (Model B / D032); nest peel→HSPLIT PASS; no mismatch |
| TD3 | **skip** | CENTER join is D024/`mergeWindowsIntoGroup`; R012/R019 shipped; no CENTER miss after R036 |
| TD4 | **defer** | Docs one-liner after D044 ships; not a ready slice |

TD0 inventory: **skip** (operator + nest already trust grab vs titlebar).
TD1 remains **done**.

### 4. Tab click residuals

**None.** R025/R026 host PASS; R032 Done restack-only shipped; R036
cold forest has real TABBED groups on both mons. Do not open a new
regression without a post-PASS host repro.

## Follow-up implement

| Path | Status | Why |
| --- | --- | --- |
| [forge-tab-groups-same-mon.md](./forge-tab-groups-same-mon.md) | **next** | Enforce D044 |
| chrome / group-chrome A / TD2–TD4 / click | **none** | Locked above |

## Acceptance (planning complete)

- [x] Written recommendation for chrome clear gate
- [x] Cross-mon tabs: unsupported + normalize rule (D044)
- [x] TD2 skip / TD3 skip / TD4 defer
- [x] Follow-up implement drafted (one task)
- [x] PRIORITY + HANDOFF queue updated

## Non-goals (unchanged)

- Implement in this planning file
- STACKED product chrome polish
- Resize / autotile

## Context for the next agent

- Implement **only** [same-mon](./forge-tab-groups-same-mon.md).
- Do not retarget overlay before all-hard.
- Do not invent spanning tab chrome.
- Do not reopen R025/R026/R032 without a new repro.
- Discussion lock also in
  [cross-mon D0](./forge-tab-groups-cross-mon_d0-discussion.md).

## Session note

**2026-08-16 D0 locked (4.6 xhigh).** Overlay = all-hard (already
shipped + R036 verified). Cross-mon groups unsupported; normalize to
CON MONITOR ancestor (D044). TD2/TD3 skip; TD4 defer. Tab click none.
One implement task: same-mon groups.
