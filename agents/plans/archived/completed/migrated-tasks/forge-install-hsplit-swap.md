# forge-install-hsplit-swap — Install must not swap mon HSPLIT children

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-12

## Goal

`forge install` after `forge layout dev` must not swap the right-monitor HSPLIT
(terminals left, tab group right). Install is disable → copy → enable +
session-layout restore — not a layout apply.

## Acceptance

- [x] Mixed-mon `applyMonitorSnapshot` keeps descriptor child order when the
      first rebuilt root is already the live insert anchor
- [x] Left mon `[TABBED, ghostty]` still restores correctly with an extra sibling
- [x] Wayland `forge_restart_shell` does not flush session-layout (no HUP)
- [x] Unit tests green (`tree-snapshot` 25, `session-layout` 33, H1 17)
- [x] Do not close host Ghostty windows

## Context for the next agent (complete + succinct)

- **Paths:** `lib/extension/tree-snapshot.js` `applyMonitorSnapshot`;
  `scripts/forge/_lib.zsh` `forge_restart_shell`; guard in
  `tests/unit/extension/tree-snapshot.test.js`
- **Proven:** After `layout dev`, mon1 is `[ghostty | TABBED]`. Last install
  restore forest walk was ghostty-first (correct), then ~400ms later
  `save-session-layout` (Wayland no-HUP flush, `immediate` bypasses 12s hold)
  wrote `[TABBED, ghostty]`. Mixed path: extra sibling (e.g. gjs desktop icon)
  → `insertBefore(rebuilt, anchor)` where `anchor === rebuilt[0]` is a no-op,
  then the tab CON is inserted *before* ghostty → swap. Left mon first child
  is a *new* TABBED CON so the same loop stays correct — only the right mon
  (term first) swaps.
- **Failed+why:** n/a
- **Enable/test:** `npm test -- tests/unit/extension/tree-snapshot.test.js`.
  Host Wayland cannot load new JS without nest/logout — do not run host
  `forge install` on old JS (that *is* the repro and will swap the desk).
- **Risks:** Mixed-path extras-before/after must keep extras outside the cohort
  span; empty-CON index shift.

## Session note

**Shipped in tree (host Wayland still on old JS until nest/logout):**

- `applyMonitorSnapshot` mixed path: classify extras before rebuild; reassemble
  `extrasBefore + rebuilt + extrasAfter`. No `insertBefore` same-anchor loop.
- `forge_restart_shell`: session-layout flush only in the X11 HUP branch.
- Guards: three `tree-snapshot` tests (term|tab extra-after, extra-before,
  tab|term extra-after).
- **Do not** run host `forge install` until nest/logout loads tip — old JS
  still swaps mon1; `--no-restart` is safe to stage files.
- No commit (not requested). Host tree left as `layout dev` (ghostty|tabs).
