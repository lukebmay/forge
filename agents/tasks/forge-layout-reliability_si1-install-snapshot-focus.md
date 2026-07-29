# forge-layout-reliability_si1-install-snapshot-focus

**Status:** in progress  
**Plan:** [forge-layout-reliability.md](../plans/forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

**Install/update must not use saved layouts.** Only snapshot the **current exact
tree** (structure + mon + tab/stack order + **open leaf** + **keyboard focus**)
and restore that after Shell reload.

## Live report

User was browsing **Chrome** (not Grok) in mon0 tab group; after `forge install`,
**Grok** became active/focused instead of the open Chrome window.

## Product rule (locked)

| Install/update | Layout profiles (`forge layout`) |
| --- | --- |
| `session-layout.json` from live tree only | Named profiles under `layout/` |
| No profile reconcile on install | Explicit user command only |
| Preserve focus + lastTabFocus + order | Desired-state open/move/claim |

## Hypotheses

1. Deferred `focus-update` queue leaves **stale `lastTabFocus`** (Grok) at save flush
   while Mutter focus is already Chrome.
2. Restore raises group `lastTabFocus` then fails to re-activate saved
   `focusWindowId` (resolve miss / thrash).
3. Match remaps focus id to wrong Chrome sibling after title churn.

## Acceptance

- [ ] Save flush **synchronously** records keyboard focus window id and sets
      each focused window’s parent `lastTabFocus` before portable write.
- [ ] Restore activates **saved focusWindowId** (not profile/active sugar); open
      leaf per CON from saved `lastTabFocusId`.
- [ ] Install path still does **not** invoke `forge layout` / profiles.
- [ ] Unit tests: stale lastTabFocus corrected on save; restore prefers
      focusWindowId over wrong lastTab when both set.
- [ ] Docs one-liner: install = tree snapshot only (DESIGN or troubleshooting).

## Non-goals

- Layout mon thrash (LF3/LF4).
- Changing bare-array layout sugar.
