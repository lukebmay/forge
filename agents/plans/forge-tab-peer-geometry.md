# forge-tab-peer-geometry — Tab/stack slot size + visible-first heal

**Status:** Accepted (FIRM lock) — 2026-08-24  
**Decision:** **D069**  
**Branch:** master  
**Related:** D025 / R025 (reveal), D026 (TILE slot authority), D043 (CON chrome),
D044 (mon-local groups)

## FIRM locks (no drift)

Do **not** change the rules below without a **very significant** reason.
If a reason appears, **stop**, write trade-offs on this plan + chat, and wait
for an explicit go — do not silently “improve” past the lock.

### 1. Shared slot (geometry authority)

Every TILE peer in a TABBED/STACKED CON shares one content rect (the group
pane). Tree `processTabbed` / `processStacked` assign that rect; Meta frames
must match within ε after commit.

### 2. When to size

Size peers when they **join** the group and whenever the **group slot**
moves or changes size. Path: `commitLayout` → `tree.render` / `apply` →
`reassertAllTabStackSlots` (+ post-echo heal). Tab click is **not** the
primary size path.

### 3. Tab click / reveal

`revealGroupChild`: open leaf + raise (+ keyboard focus). R025 reassert of
the **revealed** child only is a **safety net**. Do not reassert all peers
from `updateTabbedFocus` / `afterFocus` (PWA frame-lie thrash).

### 4. Visible-first priority (FIRM)

| Priority | What | Timing |
| --- | --- | --- |
| **1 — visible** | Open leaf of each TABBED/STACKED group (`lastTabFocus`); other on-screen TILE leaves already handled by normal `tree.apply` | **Before** buried tab peers; never queue open-leaf `move_resize` behind buried peers |
| **2 — buried peers** | Other TILE children in the same groups (still mapped; under the open leaf in Z-order) | Same commit turn **after** visible, and/or idle / post-echo background heal |

Mutter/Meta: buried tab peers stay **mapped** Meta windows. Forge “hidden”
means z-order under the open leaf, not withdrawn. `move_resize_frame` on a
buried peer is valid and preferred so the next tab switch is already in-slot.

### 5. Governance

- Verify mismatch stays **diagnostic** (AC1) — not an auto `requestLayout` loop.
- Do not reintroduce shrink-probe or focus-path all-peer reassert.
- Newest DECISIONS/plan lock on this topic wins; supersede with a new ID.

## Trade-offs (recorded before stronger scheduling)

| Approach | Pros | Cons | Status |
| --- | --- | --- | --- |
| **A. Size only on tab click (R025)** | Simple reveal path | Half-height open leaf; DnD slot/frame lies; “click to size” | **Rejected** (was the bug) |
| **B. All peers sync on every focus** | Always correct frames | Chrome PWA thrash / flicker (historical) | **Rejected** for focus path |
| **C. All peers sync on commit, open leaf first, then buried; post-echo heal** | Matches locks; simple; buried ready before next click | Large groups do N `move_resize` in the render idle | **Accepted default** |
| **D. Visible sync; bury peers only on idle/post-echo** | Slightly snappier open leaf under heavy peer count | Brief window where fast tab switch races heal (R025 covers) | **Allowed optimization** under lock §4 — implement only with a note here if measured need |

## Implementation map

| Piece | Where |
| --- | --- |
| Assign shared rect | `tree.processTabbed` / `processStacked` |
| Meta move all TILE | `tree.apply` |
| Ordered reassert | `FocusManager.reassertAllTabStackSlots` (visible then buried) |
| Post-echo heal | `WindowManager._schedulePostRenderTabSlotHeal` |
| Reveal safety net | `revealGroupChild` → `reassertNodeToSlot` (one child) |
| Contracts | `docs/dev/contracts.md` · `docs/dev/actions.md` · **D069** |

## Done when (lock)

- [x] D069 + this plan Accepted
- [x] contracts/actions/DESIGN state shared-slot + visible-first + no silent drift
- [x] Code: open-leaf-before-buried in `reassertAllTabStackSlots` (align to §4)
- [ ] Host tip: Chrome+Grok left tab — open leaf full slot without click

## Session note

2026-08-24: Operator locked shared-slot sizing + visible-first FIRM. Meta
nuance: buried ≠ unmapped; heal while buried is OK. Default impl = C; D only
if measured. `reassertAllTabStackSlots` is two-pass (open-leaf then all).
