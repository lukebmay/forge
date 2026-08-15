# forge-tab-click-pin-adopt — tab click during layout pin snaps back (R026)

**Status:** done (L0 green; host live PASS 2026-08-14)
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-14

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
- [x] Live: host tip loaded; immediately after `layout dev`, click the
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
- **Enable/test:** L0 below. Host live signed this session.

```bash
npm test -- tests/unit/extension/action-pipeline.test.js
python3 -m pytest tests/unit/cli/test_live_matrix.py -q -k r026
```

## Session note

**2026-08-14 host live PASS** on tip `g4b2a374` (R026 JS already on
host). `forge layout dev` (7 reused) then immediately
`forge focus class:google-chrome --first` (DBus → `revealGroupChild`).

| t | lastTabFocusId | focusWindowId |
| --- | --- | --- |
| +0.3s | Chrome `2946577600` | Chrome `2946577600` |
| +1.8s | Chrome `2946577600` | Chrome `2946577600` |
| +4.8s | Chrome `2946577600` | Ghostty `2946577603` |

Did **not** snap back to Grok `2946577601`. Open leaf stayed Chrome
even after keyboard focus moved to mon0 Ghostty. Agent Ghostty
`2946577602` untouched on mon1. No nest used for this residual.
