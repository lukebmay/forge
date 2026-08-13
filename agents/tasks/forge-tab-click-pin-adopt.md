# forge-tab-click-pin-adopt — tab click during layout pin snaps back (R026)

**Status:** ready (L0 green; live after host tip)
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

After `forge layout`, clicking a non-open tab in a TABBED/STACKED group
must show that window and **keep** it. Layout pin must not treat the
click as Chrome/PWA steal.

## Acceptance

- [x] `revealGroupChild` of a different child while a pin is live adopts
      that child as the pin
- [x] Subsequent meta-focus on the clicked child does not restore the
      old leaf
- [x] Late activate of the old leaf after adopt restores the clicked child
- [x] Reveal with no live pin still does not start one
- [x] `pin: true` still pins as before
- [ ] Live: host tip loaded; immediately after `layout dev`, click the
      other tab — it stays (no flash-then-Grok)

## Context for the next agent (complete + succinct)

- **Phase:** focus residual (D018 pin), not structure.
- **Repro (green, 1-mon):** `forge layout dev` → left TABBED Chrome+Grok
  (Grok open) \| term. Click Chrome tab → Chrome flashes → Grok back.
  Second click sticks (pin expired or they retried after settle).
- **Root:** `revealGroupChild` tab-click uses `pin: false`. Layout still
  holds Grok for 15s. `activate` emits meta-focus →
  `restoreLayoutOpenLeafIfStolen` brings Grok back.
- **Fix:** adopt live pin onto the revealed child. Do not invent a new
  pin when none is live. Canonical API remains `revealGroupChild`.
- **Not CLI soft-barrier:** if they click *while* `layout` is still in
  the soft wait, CLI can still re-apply profile `active`. After the
  command returns, only the extension pin remains — that is this bug.
- **Enable/test:** L0 below. Live needs `./install` + nest or logout.

```bash
npm test -- tests/unit/extension/action-pipeline.test.js
python3 -m pytest tests/unit/cli/test_live_matrix.py -q -k r026
```

## Session note

2026-08-13: operator report on green after latest install. R025 was
slot size; this is pin-vs-user-intent. Extends `revealGroupChild`.
