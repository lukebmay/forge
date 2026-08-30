# forge-settled-slot-authority — Know facts; no opportunistic re-resize

**Status:** design meeting queued (brief)
**Branch:** master
**Blocker:** [`../blockers/settled-slot-authority-design.md`](../blockers/settled-slot-authority-design.md)
**Updated:** 2026-08-30
**Related:** D069 (tab peer geometry) · D026 (TILE slot restore) · D092/D093 (Forest + AGREE) · R025 (reveal safety net)

## Operator thesis (proposed lock — meeting decides)

Once Forge has moved a TILE into a slot and that placement is **settled**,
do **not** issue another `move_resize` to the same slot unless Forge
**knows** the window has drifted (or the slot itself changed).

Do **not** operate in a “maybe Meta is lying, so re-heal everything”
world. Prefer:

1. **Know the facts** (Forge-owned commit record; Meta as a sensor).
2. Do the **minimum** write to correct a **known** problem.
3. Cache Meta/Mutter facts in the host bag when re-query is expensive.

Forge should always know where every managed element is on screen.

## Why this meeting (not a silent patch)

D069 already says tab click is not the primary size path, but the live
code still has **multiple heal waves** after every present
(`tree.apply` → `reassertAllTabStackSlots` → post-render heal → optional
`force: true` on join / apply epoch-end). That is exactly the thrash class
the operator is pointing at. Changing it amends D069’s “heal until sure”
posture — needs an explicit lock, not drive-by deletion of R025.

## Audit snapshot (Meta geometry writes)

Full inventory lives with the meeting notes; headline risks:

| Path | Class | Why it smells under the thesis |
| --- | --- | --- |
| `Tree.apply` → `wm.move` every paint | known-structure | Re-probes Meta every render; no Forge “already committed this paint” skip |
| `renderTree` → `reassertAllTabStackSlots({ force: false })` | opportunistic heal | Second wave immediately after apply |
| `_schedulePostRenderTabSlotHeal` | echo / heal | Third delayed wave (~echo+40ms) |
| ApplyLayout epoch-end `reassertAllTabStackSlots({ force: true })` | blind force | Ignores in-slot; assumes Meta untrustworthy |
| CENTER join `_reassertTabStackSiblingSlots(..., force: true)` | blind force | Same; added to make tab-click raise-only |
| `revealGroupChild` R025 | safety-net heal | OK only if truly off-slot after raise; still Meta-probe based |
| `_restoreTileToSlot` / D026 | **known drift** | Clean pattern — model for the new rule |
| `layoutEpoch.startEcho({ targetRect })` | echo only | Stores last write but is **not** SoT for skip decisions |
| Host bag (`lib/host`) | identity / float | **No geometry** today — candidate home for commit facts |

Negative control (good): `afterFocus` does **not** reassert (PWA thrash).
`layout-controller` verify must **not** auto-reassert (AC1).

## Meeting agenda (≤30 min)

1. **SoT for “in slot”** — last Forge commit? Meta frame? agree(commit, Meta)?
2. **When Meta is trusted** — open leaf vs buried tab vs during echo vs post-raise.
3. **`force: true` allowlist** — structure change / proven drift / verify give-up only?
4. **Delete or demote heal waves** — one authoritative present; heals only on known disagree.
5. **Where commit facts live** — host bag fields? echo epoch promoted? last-good expanded?
6. **Amend D069** — keep shared-slot + visible-first; retire “heal until sure” as default.

## Proposed acceptance after lock (implementation = later slice)

- [ ] CHANGELOG row (new D0xx) + `design.md` geometry-authority paragraph
- [ ] Written allowlist: who may call `move` / `reassert*` / `force`
- [ ] Thin follow-up plan slice list (delete post-render heal? commit-bit skip in apply? …)
- [ ] No silent large rewrite in the meeting session

## Do / do not

| Do | Do not |
| --- | --- |
| Brief meeting; write the lock same effort | Drive-by delete all R025 / post-render heals without a lock |
| Prefer D026-style “known drift → one write” | Keep stacking `force: true` “just in case” |
| Extend host bag / commit record if SoT needs it | Put Mutter workarea on TOM nodes (D083) |

## Context for the next agent

Operator clue: thrash correlates with re-sizing windows that should already
be settled. Tab-click raise-first (`e21e174d`) is a stopgap under D069, not
the geometry-authority lock. Proto brake and nest smokes stay green; this
plan does not unblock by coding alone.
