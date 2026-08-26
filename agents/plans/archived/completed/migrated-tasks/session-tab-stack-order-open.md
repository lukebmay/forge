# session-tab-stack-order-open

**Status:** done  
**Goal:** After install/update (Shell HUP), preserve tab/stack **sibling order** and
**which leaf is open** (`lastTabFocus`), not only desk keyboard focus.

## Acceptance

1. Portable session forest keeps CON `children[]` order (chrome L→R / stack top→bottom).
2. Match after id churn does not scramble co-framed same-pid tabs (Chrome): unique
   class+title before pid geometry; title boost on geometry ties.
3. `lastTabFocusId` round-trips for TABBED and STACKED; raise settles every group.
4. Focusing a tabbed leaf records `lastTabFocus` (symmetric with stacked).
5. CLI GetTree fallback flush writes `lastTabFocusId` + `focusWindowId`.
6. Unit tests cover tab order + open leaf + stacked open leaf + tabbed focus record.

## Non-goals

- Layout-profile sugar (`active` / `focus`) — already shipped separately.
- Changing mon L/R ensure_order for `forge layout`.

## Session note

**Shipped:**

| Area | Change |
| --- | --- |
| Match | `createWindowResolver`: unique class+title **before** pid geometry; title/class boost in `geometryMatchScore` |
| Focus record | `updateTabbedFocus` sets `lastTabFocus` (like stacked) |
| Raise | `raiseAfterSessionRestore` settles **every** group open leaf, not only desk focus |
| Rebuild | `rebuildNode` defaults `lastTabFocus` for STACKED as well as TABBED |
| CLI fallback | `_project_node_to_portable` / `_write_session_layout_from_tree` keep `lastTabFocusId` + `focusWindowId` |
| Docs | `docs/DESIGN.md` session-layout match order + tab/stack note |

**Tests:** session-layout tab/stack order+open; bug-d5mm tabbed lastTabFocus; CLI portable projection.

**Key paths:** `session-layout.js`, `session-layout-restore.js`, `focus.js`, `tree-snapshot.js`, `scripts/forge/forge`.
