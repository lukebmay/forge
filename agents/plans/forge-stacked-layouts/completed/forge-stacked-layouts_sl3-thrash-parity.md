# Task: SL3 — thrash/ensure parity for stacked multi-role

**Status:** done  
**Plan:** [forge-stacked-layouts.md](../../forge-stacked-layouts.md)

## Work

In `scripts/forge/layout_plan.py` `detect_thrash` (and any twin checks):

1. Multi-role co-group thrash: score for **both** `tabbed` and `stacked` modes (not tabbed-only).
2. Pass the correct mode into `_windows_share_group`.
3. Nested H/V under multi-role mon-child thrash: include `stacked` the same as tabbed (~L2727).
4. Reason strings: use mode-specific or generic (`stacked-roles-not-grouped:…` / keep tabbed reason for tabbed).
5. Unit tests: stacked multi-role not co-grouped → thrashed; already stacked → not thrashed; tabbed cases still pass.
6. Structure ensure already accepts stacked (SL1); only thrash gaps if any.

## Non-goals

- SL4 full regression pack / e2e
- Live black SL5

## Acceptance

1. detect_thrash treats stacked multi-role like tabbed for co-group + nested-split cases
2. Tests green
3. Plan/task notes; next SL4 optional

## Session note

**2026-07-28 SL3 (Task Force A)**

- `detect_thrash`: multi-role co-group + nested-split now cover `tabbed` **and** `stacked`.
- Reasons: `{mode}-roles-not-grouped:{slot}` (e.g. `stacked-roles-not-grouped:mon0.stack`).
- `_windows_share_group` already mode-aware; structure ensure unchanged (SL1).
- Tests in `TestDetectThrash`: not-grouped, grouped OK (`tree-stacked-pair`), nested HSPLIT with stacked comms; tabbed fixtures still pass.
- `python3 -m pytest tests/unit/cli/test_layout_plan.py -q` → 136 passed.
- Next: **SL4** optional regression pack.
