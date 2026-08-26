# Task: Mon-level L/R pane order on layout apply

**Plan:** ad-hoc (pre-rename; modules now layout_*)  
**Pri:** P0 / day-to-day  
**Status:** done (implement)

## Problem

`forge layout dev` builds groups correctly but **left/right mon children can be reversed**.

Live black after boot + one Ghostty + `forge layout dev`:

| Mon | Desired (profile L→R) | Actual |
| --- | --- | --- |
| mon0 | tabs (Chrome\|Grok) \| Ghostty | Ghostty \| tabs |
| mon1 | Ghostty \| tabs (YT\|Gmail\|Voice) | OK (often) |

Root cause (confirmed):

1. Planner treats mon-correct roles as `reused` and **never checks mon-child sibling order**.
2. Second `workon` → `nothingToDo` with wrong L/R.
3. Mon `ensure_layout` hsplit only sets layout mode on one anchor; does **not** reorder mon children.
4. Starting with Ghostty on mon0 + PlaceNext append for Chrome/Grok yields `[ghostty, tabs]`.

## Acceptance

1. Pure planner: forest with mon0 `[ghostty WINDOW, TABBED chrome/grok]` + black `dev` profile → **not** nothingToDo; emits order repair for mon0 (ordered reps: tab role first, ghostty second).
2. Perfect order forest → still nothingToDo (no thrash).
3. Apply path reorders **mon-level** siblings (WINDOW **or** TABBED/STACKED CON) without peeling tabs or demoting TABBED → HSPLIT.
4. Unit tests for plan detect + apply step mapping; existing workon plan/apply tests stay green.
5. Optional: open PlaceNext can still append; **post-structure order ensure is the source of truth**.

## Approach (preferred)

1. **`layout_plan.py`**: After claim, for each mon with ≥2 layout children and hsplit/vsplit, compare live mon-child indices of role representatives (path `moN…/childIdx/…`) to profile child order. On mismatch → action e.g. `ensure_order` (or `ensure_layout` + `order: true`) with `windowIds` = one rep per mon child in **profile** order. Count as structure/work so `nothingToDo` is false even when opened/moved=0.
2. **`layout_apply.py`**: Map to RunSteps the extension can execute.
3. **`session-api.js` / run-steps**: Op that walks each window → mon-direct ancestor, reorders those unique mon children under MONITOR, `resetSiblingPercent`, quiet render. Do **not** use `swapPairs` (WINDOW-only; breaks tabs).
4. Tests under `tests/unit/cli/`.

## Out of scope

- Rename workon → layout (separate task)
- Stacks product work

## Session note

**Shipped**

- Planner: `_mon_child_reps` / `_mon_order_matches` / `_mon_order_actions` → `ensure_order` when mon hsplit/vsplit child indices not strictly increasing; `counts.ordered`; counts toward `has_work` / `nothingToDo`.
- Apply: `ensure_order` → `{op: order, windowIds: [id:…]}` after place + layout steps.
- Extension: `order` in `EXTENSION_OPS` + validate; `_orderMonChildrenOp` walks mon-direct ancestors, dedupes, reorders `parent.childNodes`, `resetSiblingPercent`.
- Tests: `TestMonOrder`, apply order mapping, run-steps schema; fixture `tree-mon0-reversed.json`.

**Key paths**

- `scripts/forge/layout_plan.py` — plan + helpers
- `scripts/forge/layout_apply.py` — step mapping
- `lib/extension/run-steps.js` — schema
- `lib/extension/session-api.js` — `_orderMonChildrenOp` / `_monDirectAncestor`

**Live verify**

```sh
forge layout plan dev   # reversed mon0 → ensure_order; perfect → nothingToDo
# install + HUP, then forge layout dev and check mon0 L→R
```

**Next-agent**

- Optional residual replan after first apply if move+order race edge cases.
- workon→layout rename still out of scope.
- No commit unless asked.
