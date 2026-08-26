# Task: forge-layout-mon-child-topology

**Status:** done (B AGREE; wrap-up commit)  
**Plan:** (standalone)  
**Branch:** `task/forge-layout-mon-child-topology`  
**Created:** 2026-08-07  
**Host evidence:** black Wayland dual 4K — operator `forge layout dev` residuals

## Goal

Fix planner blind spot: mon-level profile wants **tab \| ghostty** but live mon is **one TABBED bag** of chrome+Grok+ghostty. Plan today claims `structureMatch: true` and only emits useless `ensure_order` + focus. Also fix `forge layout save` float-only desks raising `profile roles must be non-empty`.

## Live evidence (2026-08-07)

### mon0 giant tab (WS1 / Meta ws0)

```text
mo0ws0 HSPLIT
  CON TABBED  [google-chrome, ghostty, Grok]   # all three co-tabbed
mo1ws0 HSPLIT
  ghostty | TABBED[YouTube, Gmail, Voice]      # correct
```

`forge layout dev --dry-run`:

| Field | Value |
| --- | --- |
| structureMatch | **true** (wrong) |
| structure | 0 |
| ordered | 1 (`ensure_order mon0` chrome+ghostty — both under same TABBED) |
| focus | Grok active → YouTube active → ghostty profile |

Parent index: chrome/Grok/ghostty all `parent_path=mo0ws0/0` TABBED.

### Chrome vs Grok open leaf

Profile mon0.s0 `active: Grok`. Visible leaf often Chrome/ghostty because:
1. bag is wrong (ghostty inside tab), and/or
2. focus ends on profile `ghostty` while that leaf is still *inside* the tab bag.

Fix topology first; focus order already emits active Grok before profile focus.

### `forge layout save vinyl` on WS2 (Inkscape FLOAT only)

```text
forge layout save: profile roles must be non-empty
```

Root: float-only → `tiles={}` + `floating=[…]` → desugar empty tiles → `roles=[]` → validate fails. Prefer clear error or valid float-only profile.

### Thrash catalog

`forge thrash` shows counters; **settleSampleCount=0** (session memory only; no long-term app history).

## Acceptance

1. **Giant-tab fixture** (dev profile + mon0 all three co-tabbed under one TABBED CON; mon1 correct):
   - `structureMatch` is **false** with a mon-child / cross-slot group mismatch (or equivalent).
   - Plan emits structure repair that **peels** mon-child roles:
     - demote shared TABBED→HSPLIT (or equivalent peel), then
     - `ensure_layout mon0.s0` tabbed with **only** chrome+Grok windowIds, then
     - mon order / mon split as needed.
   - After mapped apply steps (unit/regression), mon0 is **not** one giant tab of three roles; tab bag is chrome+Grok only; ghostty is mon-sibling (or outer HSPLIT sibling).

2. **`compare_layout_structure`** reports mismatch for the same forest (single source of truth).

3. **Float-only save:** `capture_tiles_profile` / CLI save on FLOAT-only mon:
   - either writes a valid profile with `floating` (and non-empty roles if required by validate), **or**
   - fails with a **clear** message like `only floating windows to capture` / `no tiled windows` — **never** `profile roles must be non-empty`.

4. Unit tests cover (1)–(3). `pytest` layout CLI tests green for touched files; broader suite if cheap.

5. Docs: brief note in `docs/user/layout.md` or troubleshooting only if user-facing save message changes.

## Non-goals

- SL3 drop Ghostty seed (still needs thrash samples).
- Live Shell install / logout (operator).
- Persisting thrash catalog to disk.

## Implementation hints

- `scripts/forge/layout_plan.py`: `compare_layout_structure`, structure loop ~2227–2333, `_windows_share_group`, `_mon_order_actions`, `_layoutOp` wrap only for mon/H-V multi-window (not already-TABBED).
- Peel sequence: **HSPLIT demote on bag** then **TABBED subset wrap** (see `bug-tz-tab-apply-flatten.test.js` “wrap subset, leave non-member sibling”).
- `scripts/forge/layout_save.py`: empty `tiles` + non-empty `floating` must not call validate with empty roles without handling.

## Session note

**2026-08-07 wrap-up (A/B AGREE → commit)**

Shipped mon-child topology peel + float-only save UX.

| Piece | Detail |
| --- | --- |
| Detect | `_mon_child_topology_mismatches` + polluted tab group foreign mon-child |
| Peel | demote mon hsplit → `ensure_layout mon0.s0` tabbed role-only ids |
| Save | float-only → `only floating windows to capture` |
| Tests | fixture `tree-mon0-giant-tab.json`; 426 CLI unit pass |
| Live offline | `/tmp/forge-full-tree.json` peels chrome+Grok; structureMatch false |

**Operator next:** install tip + **logout** (Wayland) → `forge layout dev` twice (full + ghostty-only re-layout); confirm mon0 tab\|ghostty and Grok active leaf; `forge thrash` for settle samples.

**Branch:** task/forge-layout-mon-child-topology → merge master. No push.
