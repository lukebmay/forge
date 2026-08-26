# forge-ws-open-leaf-silent-lasttabfocus — silent lastTabFocus clobber before WS preserve

**Status:** done (host PASS session `G2DXn`)
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-24

## Goal

Stop mon1 open leaf flipping YouTube→Voice across `layout dev` → `layout vinyl`
→ back WS1. Preserve already runs on tip; open leaf is **already Voice** before
`restoreOpenLeafIfWorkspaceFocusSteal` (`already-open`), with **no**
`lastTabFocus tab …→Voice` TRACE — a silent writer clobbered it.

## Acceptance

- [x] Inventory every `parent.lastTabFocus =` / `con.lastTabFocus =` path; TRACE
      (or route through `updateTabbedFocus`) for TABBED writers that can fire
      during WS change / reveal / settle
- [x] Fix so WS return cannot adopt Voice when YouTube was the pinned/open leaf
      after layout apply (pin TTL expiry alone must not lose open leaf)
- [x] L0: action-pipeline + WindowManager-focus (+ regression if cheap)
- [x] Overwrite this task session note + HANDOFF; host retest soft
- [x] `./install --dev` staged for human logout (do not commit unless asked)
- [x] Host PASS `G2DXn`: `ws-change preserve hit open=…YouTube stealer=…Voice`

## Context for the next agent (complete + succinct)

### Shipped on dirty tip (this implement)

1. **`syncLastTabFocusFromFocus`** — no longer stomps live LTF from Mutter focus
   (D018). Fills empty/dead only; `focusWindowId` stays separate on save.
2. **`FocusManager.setOpenLeaf`** — canonical LTF writer + TRACE (`tab`/`stack`).
   `updateTabbedFocus` / `updateStackedFocus` call it; WM delegates.
3. **`revealGroupChild` / `pinLayoutOpenLeaf` / pin-restore fallback** — route LTF
   via `setOpenLeaf` (no twin direct assign before settle). Raise still after
   R025 reassert.
4. **Tests:** session-layout regression (YouTube kept when focus=Voice); fill-empty
   + dead-LTF cases. action-pipeline + WindowManager-focus green.
5. **Untouched:** D026 `_schedulePostEchoSlotReassert` / postEchoSlot.

### Proven (`NTJ5d`)

- `20:33:14` LTF→YouTube; return `20:33:51` preserve miss `already-open` Voice;
  no `lastTabFocus tab …→Voice`. Save sync ~1.5s after WS `renderTree` was the
  primary clobber. Prior:
  [completed](./completed/forge-ws-switch-open-leaf-steal.md).

### Verify (human after logout)

```bash
# tip already ./install --dev — logout to load, then:
# layout mon1 YouTube open → vinyl → back WS1; open leaf must stay YouTube
forge log --grep 'lastTabFocus tab|ws-change preserve|revealGroupChild' --level trace --since 10m
```

L0 (agent green 105):

```bash
npm test -- tests/unit/extension/action-pipeline.test.js \
  tests/unit/window/WindowManager-focus.test.js \
  tests/unit/extension/session-layout.test.js
```

## Session note

**Host PASS (`G2DXn` 2026-08-24):** return from vinyl
`ws-change preserve hit open=…YouTube stealer=…Voice` — open leaf stayed
YouTube. Super+2 fakout is a **separate** bug — see
[forge-ws-super2-bounce](./forge-ws-super2-bounce.md).
