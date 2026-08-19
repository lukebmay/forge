# Open/launch min-size → tab walk → float

## Context

DnD already paints **red** and **refuses** drops that would shrink any involved app below its min (`dropWouldOverflowMins`). Free opens (dock / `forge launch` without a slot pin / focus-LFT aspect split) still carve a 50/50 H/V or D032 slot-split even when the resulting panes would be illegal for the new app or the existing unit.

**Product ask:** for free opens only, if the intended split would overflow mins, do not place there. Prefer a tab group that fits; BFS same-monitor neighbors for another tab home; if none fit, float the new window.

**Out of scope (locked with user):**
- DnD drop commit (keep red + refuse)
- ApplyLayout / PlaceNext **slot pins** (no retarget walk; slot machines own size)
- Replacing optional tiny-pane QoL (`tiny-pane-tab-fallback-enabled`) — keep as separate earlier-tab setting

## Decisions (confirmed)

| Topic | Choice |
| --- | --- |
| Scope | Free open/launch only |
| PlaceNext pins | Excluded |
| Tiny-pane setting | Keep separate; this policy is **always on** when mins are known |
| Neighbor order | BFS same-monitor units from LFT |
| Last resort | Float the new window |
| Fail-open | Unknown mins (0×0) → current split behavior (same as DnD) |

## Recommended approach

Add a **pure placement resolver** next to existing open/min helpers, then wire it into the free-open path in `trackWindow` so we choose attach dest **before** carving structure.

### Policy (when mins readable)

1. Compute intended **edge split** against LFT unit slot (same half-axis math as `dropWouldOverflowMins` for H/V).
2. If split is legal → keep today’s path (`_maybeAspectSplitForOpen` + `slotSplitForInsert`).
3. If split overflows:
   - Try **tab** on LFT unit (full-pane must fit `max(newMins, destUnitMins)`).
   - If LFT tab overflows, BFS other same-monitor layout units (TILE windows + TABBED/STACKED CONs as one unit); first whose full rect fits both mins → tab there.
   - If none → **float** (no split carve; mon-root append; float override / stay FLOAT through `processFloats`).

Tiny-pane remains an earlier branch: when enabled and its threshold fires, tab-on-LFT still wins even without known mins. Mins-walk only runs when we would otherwise H/V split and mins say that split is illegal.

### Pure API (new)

Prefer extending `lib/extension/drop-intent.js` (already owns overflow math) or a sibling open helper (e.g. `lib/extension/open-min-place.js`) so WM stays thin.

```js
// Pseudocode — names illustrative
resolveOpenMinPlacement({
  lftUnit,                 // layout unit (window or tab/stack CON)
  orientation,             // "horizontal" | "vertical" from aspect
  newMins,                 // {width,height} for the opening meta (hints/class floor)
  slotRectFor,             // (unit) => rect
  sameMonitorUnits,        // BFS-ordered candidates including lftUnit first
}) →
  | { kind: "split" }
  | { kind: "tab", targetUnit }
  | { kind: "float" }
```

Reuse:
- `unitMins` / exceed half-vs-full checks from `drop-intent.js` (factor shared `splitWouldOverflowMins` / `tabWouldOverflowMins` if cleaner than calling `dropWouldOverflowMins` with synthetic ops)
- `readWindowMinSize` for new meta + dest
- `tree.layoutUnit` / `_resolveInsertUnit` for units
- `tree.group` / `mergeWindowsIntoGroup` / existing LFT tab wrap (`tree.split` + `TABBED`) for commit
- `addFloatOverride` (or a one-shot `_forgeOpenMinFloat` flag cleared on user FloatToggle) so `processFloats` does not immediately re-tile

### Wire points (`window.js`)

**Free open only** (`!placePinned` && `willTile` && `!deferHidden`):

Today:

```text
_maybeAspectSplitForOpen(attachLft)
slotSplitForInsert(insertUnit)
attach as sibling / percent
```

New:

```text
mins = readWindowMinSize(meta)
decision = resolveOpenMinPlacement(...)
if decision.kind === "split":
  existing tiny-pane + aspect + slotSplit
elif decision.kind === "tab":
  ensure TABBED around decision.targetUnit (or join if already tab/stack)
  attachTarget = that group; skip H/V carve
elif decision.kind === "float":
  skip carve; attach under monitor root; mark float override / open-min-float
```

Do **not** change PlaceNext pin attach (`placePinned === true`).

`_rehomeAttachAfterMonLft` (rehome admit) should call the same resolver so residual rehome does not recreate postage-stamp splits.

### BFS candidate enumeration

Same monitor as LFT (via tree MONITOR ancestor):

1. Start queue with LFT `layoutUnit`
2. Expand: tiled siblings of current unit under the same parent (windows + H/V CONs + tab/stack CONs as units)
3. When siblings exhausted, climb to parent unit and continue (uncles), until MONITOR
4. Dedup; skip FLOAT / GRAB_TILE / the opening node (not in tree yet)

Tab fitness = full `slotRect` ≥ max(new, dest) mins on both axes (CENTER semantics).

### Float last resort

- Create node under monitor (or attach without percent carve)
- `addFloatOverride(meta, /* withWmId */ true)` so it stays FLOAT after `processFloats`
- Skip `insertChildPercent` / `_tileInsertUnit`
- Optional: log `open-min-float` at INFO for journal diagnosis

Do not persist a class-wide float rule.

## Critical files

| Path | Change |
| --- | --- |
| `lib/extension/drop-intent.js` or new `open-min-place.js` | Pure resolver + overflow helpers |
| `lib/extension/window.js` | Wire free-open + rehome; float mark |
| `docs/dev/contracts.md` | New row: open/launch min placement |
| `docs/DESIGN.md` (short) | Note always-on open mins walk vs tiny-pane |
| `tests/unit/extension/…` | Pure resolver cases |
| `tests/unit/window/WindowManager-open-app-policy.test.js` | Integration: overflow → tab LFT; LFT too small → neighbor tab; none → float; PlaceNext pin unchanged; fail-open; tiny-pane still works |

## Test plan

**Pure**
- Split legal → `split`
- Split illegal, LFT pane fits both → `tab` on LFT
- LFT tab illegal, sibling unit fits → `tab` on sibling (BFS)
- All same-mon units illegal → `float`
- Zero mins → `split` (fail-open)
- Candidate order is BFS from LFT, same mon only

**WM integration** (`WindowManager-open-app-policy`)
- Seed LFT with known mins + small rect → open with large class floor → TABBED with LFT (not HSPLIT)
- LFT too small for tab, neighbor large enough → tab on neighbor
- All panes too small → FLOAT + float override; no H/V carve under LFT
- PlaceNext / `fromPlaceHint` pin path still attaches without walk
- Tiny-pane enabled still tabs on threshold without needing mins

**L0 command**

```bash
npm test -- tests/unit/extension/drop-intent.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/unit/extension/lft-mru.test.js
```

Nest (after implement): mon=1 free open Nautilus onto a short pane that DnD marks VSPLIT-red conceptually → expect tab or float, not half-height split. PlaceNext layout apply unchanged.

## Risks / traps

- **Unknown mins at map:** fail-open; class floor from prior Nautilus sessions is how Wayland gets signal — same as DnD red zones.
- **Do not walk PlaceNext pins:** breaks ApplyLayout forest match.
- **Tab already parent:** join existing TABBED/STACKED via `insertWindowIntoGroup` / group APIs; do not wrap twice.
- **D032 leftover 1-child H/V:** resolver should see the **insert unit** (bag), not a nested leaf only.
- **Float override lifetime:** user FloatToggle must still work; prefer wmId override so class siblings keep tiling.
- **Deferred LayoutBatch opens:** keep existing defer; run resolver when not deferred (or at release) — do not carve mid-batch.

## Implementation slices

1. Pure `resolveOpenMinPlacement` + unit tests (+ factor overflow helpers if needed)
2. Wire free `trackWindow` path + float mark; contracts row
3. Wire `_rehomeAttachAfterMonLft`; open-app-policy cases
4. DESIGN one-liner; nest smoke if mins known; task/HANDOFF note

## Explicit non-goals

- Changing DnD red preview or refuse
- Auto-retargeting ApplyLayout slots
- Removing tiny-pane setting
- Cross-monitor tab walk (D044 mon-local)
