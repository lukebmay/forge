# forge-tab-peer-slot-size — Size all tab peers on commit; click = raise/focus

**Status:** agent done (host tip retest open)
**Plan:** [forge-tab-peer-geometry](../../plans/forge-tab-peer-geometry.md) (**D069** FIRM)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-24

## Goal

Align TABBED/STACKED geometry with product intent: every TILE peer shares the
group content rect after join and whenever the group slot moves/resizes. Tab
click / reveal only raises + focuses (R025 reassert = safety net, not the
primary size path).

Also fix DnD log noise that hid same-mon empty-target no-ops.

## Acceptance

- [x] Post-`tree.render` / apply: all TABBED/STACKED TILE peers reasserted to
      slot (ε; not on focus hot path)
- [x] One coalesced post-echo pass heals still-mismatched tab peers
- [x] Tab click still `revealGroupChild` only (no full `renderTree("focus")`)
- [x] DnD: log `dnd commit empty-mon` only after real rehome; `no-decision` +
      `zone-none` at DEBUG
- [x] Unit / regression coverage green (68 tests in focus + layout-controller +
      r015)
- [x] contracts/actions wording updated
- [ ] Host tip: left-mon Chrome+Grok tab group — both full slot without click;
      `forge log --grep 'post-render-tab-slots|rect-mismatch|dnd empty-mon|zone-none' --level debug+`

## Context for the next agent (complete + succinct)

- **Design answer:** Yes — size all peers on join/slot change; click = raise/focus.
- **Root drift:** `tree.apply` already moves all TILE, but Chrome often stays
  `rect-mismatch`; verify is log-only (AC1); `_reassertTabStackSiblingSlots`
  existed unused (removed from focus for PWA thrash). Click R025 was the only
  heal → “sized when I click.”
- **Shipped:** `FocusManager.reassertAllTabStackSlots` + WM wrapper; call after
  `tree.render` in `renderTree`; `_schedulePostRenderTabSlotHeal` (echo+40ms,
  skip apply-epoch / freeze / grab); DnD commit log only on success.
- **Paths:** `lib/extension/focus.js`, `window.js`, `drag-drop.js`,
  `docs/dev/contracts.md`, `docs/dev/actions.md`
- **Do not:** reassert-all on `updateTabbedFocus`; verify→reassert (AC1)

## Session note

2026-08-24: Confirmed design against D025/R025 + contracts. Logs session
`s0Erk`: Chrome `972050987` persistent rect-mismatch; `dnd commit empty-mon` +
`no-decision` was false commit log. Implemented post-render all-peer reassert +
post-echo heal + DnD log fix. Unit 68 green. Uncommitted on master — tip reload
for host eyes.
