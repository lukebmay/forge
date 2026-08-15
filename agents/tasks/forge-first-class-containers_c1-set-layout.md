# forge-first-class-containers_c1-set-layout — Non-destructive setLayout (I1)

**Status:** later — after **C0**  
**Plan:** [forge-first-class-containers](../plans/forge-first-class-containers.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.6` (lossy flatten is sharp). 4.5 only if C0
inventory is complete and every call site is listed.

## Goal

Changing a CON between HSPLIT / VSPLIT / TABBED / STACKED **does not
reparent or flatten children** (invariant I1). `layout-cycle` and
keybind layout toggles call one named API.

## Acceptance

- [ ] `tree.setLayout(con, layout)` (name MAY be `Node.setLayout`)
      only writes `layout` (+ any chrome flag). Child node **identity**
      and order unchanged
- [ ] Catalog row in `docs/dev/contracts.md`: job “change CON
      layout mode” → that API
- [ ] `session-api` `layout-cycle` uses it (today it assigns
      `parent.layout` and may `resetSiblingPercent` on split axis —
      percent reset on H↔V is **allowed** if documented; flattening
      nested CONs is **not**)
- [ ] Call sites from the C0 inventory converted or listed as
      remaining with a reason
- [ ] Unit: children ids stable across H→tab→H and tab→stack
- [ ] No silent `replaceChildren` that drops nested CONs
- [ ] `commitLayout` once after the mode change (existing pipeline)

## Context for the next agent (complete + succinct)

### Why this is worth

Tabs are first-class containers only if toggling layout does not
destroy the group. TD1 reorder is useless if a layout key later
flattens the bag.

### Today

`_layoutCycleOp` in `lib/extension/session-api.js` (~1980):
`parent.layout = next` then `commitLayout`. Some `_layoutOp` /
ensure paths historically flatten nested CONs when setting TABBED —
those are the bugs C1 deletes.

### Do not

- Implement C2 group/ungroup here
- Change insert A / D032 slot-split
- Port CLI layout
- “Helpfully” flatten 1-child CONs unless C0 already classified
  `auto-exit-tabbed` as keep

### Test

```bash
npm test -- tests/unit/tree/Tree-operations.test.js \
  tests/unit/tree/Tree-layout.test.js \
  tests/unit/command/CommandHandler.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js
```

Add `tests/unit/tree/set-layout-i1.test.js` if no existing file
covers child-id stability.

## Session note

**2026-08-14:** Queued as worth work after C0. No code.
