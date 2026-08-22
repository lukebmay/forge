# forge-layout-vinyl-hardfail-slot-ids — ApplyLayout hard-fail: slot IDs ≠ late-adopted windows

**Status:** ready
**Plan:** (none) — host verify follow-up from OH / ws-orphan tip load
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

Make `forge layout` hard-ready track the **same** Meta windows that late
place-hint adopts, so forest-match `Done.ok` is honest after open+bind on a
cold workspace.

## Acceptance

- [ ] Repro: dual-mon host, empty WS2, layout whose opens map via late
      place-hint (identity null at map) finishes with `ok: true` when tree
      shows the intended TILE slots in-slot
- [ ] Slot-machine `windowIds` after bind/open match the windows visible in
      `forge tree` / place-hint late-adopt logs (no stale pre-adopt ids)
- [ ] Job `hardReady.failed` empty when Meta geometry is in-slot; if still
      failing, DEBUG logs name **why** (mode / mon / parent / ε rect) per id
- [ ] L0: unit/regression covering “late adopt remaps slot machine window id”
- [ ] Nest or host: one cold apply of a multi-open profile proves green

## Context for the next agent (complete + succinct)

### Symptom (host 2026-08-22)

Job `~/.local/share/forge/jobs/20260822T104904Z-e208d5/` (`forge layout vinyl`
on ws **1** / WS2):

- `code: hard-failed`
- `error: required TILE slot(s) not in-slot: mon0.s0.ghostty,mon0.s0.YouTube,mon0.inkscape`
- `hardReady.timedOut: true`, `placeAttempts: 3` each
- **ID mismatch:** place-hint late-adopted YouTube=`858367307`,
  ghostty=`858367308`, inkscape=`858367309`, but slot machines failed on
  ghostty=`858367300`, YouTube=`858367299`, inkscape=`858367309`
- `forestMatch.settled` listed `858367308`/`858367307` while role slots still
  hard-failed — machines watched the wrong ids for 2/3 roles
- Same pattern on earlier job `20260822T104427Z-07529f`

### Journal (Shell pid 13750)

```text
journalctl -b --since '2026-08-22 06:49:04' --until '2026-08-22 06:49:15' | rg '\[Forge\]'
```

Highlights:

- `skeleton ws=1 mons=1` (vinyl profile is single-mon — separate config issue)
- `place-hint late mismatch re-queue` inkscape PH briefly saw Chrome class
- `place-hint map sticky … move=false` for all three
- `slot-machines n=3` then ~9s later chrome clear `phase=hard-ready` with job
  still `ok: false`
- Persistent `rect-mismatch` on YouTube id `858367307` during hard window

### Likely area

- `lib/extension/layout-apply-slot.js` / settle in-slot checks
- late place-hint adopt path (`place-hint` / `session-api` / window track)
- bind phase windowId assignment vs PH replacement

### Not this task alone

- Dual-mon / float-contaminated **profile data** →
  [forge-layout-profile-preflight.md](./forge-layout-profile-preflight.md)
  (refuse bad JSON before apply). Preflight does **not** replace this ID
  desync fix: even a correct dual-mon profile can hard-fail if machines watch
  stale ids after late place-hint adopt.
- Operator will recreate vinyl on WS2 next session; still ship this robustness.

### Enable / verify

- Host tip already DEBUG (`log-level=5`)
- Jobs: `~/.local/share/forge/jobs/`
- GJS: `journalctl -b | rg '\[Forge\]'`

## Session note

Filed from human host verify after OH1 pansi logging. Pair with tab/DnD tasks
from same session.
