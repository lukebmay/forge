# 11 — C6 Apply desired state = TOM (ex-P5c)

**As of:** 2026-08-29
**Lock:** D092 · plan `forge-live-tom-cutover.md`
**Depends:** C5 done. Implement after C5.
**Status:** C6.1–C6.6 implemented (2026-08-29); C6.7 optional brake.
C7.7 Forest-first restore/H1 landed same day.

## Proven headline

Apply IR is Forest+bag (`projectForestFromTom`) with nanoid keys
(C6.1–C6.4). Session/H1 identity is nanoid (C6.5). Restore/H1 mutate
Forest then paint (C7.7). C6.6 retired GetTree-as-planner-input.

## Flow today

```text
ApplyLayout → LayoutApplyRunBag
  → projectForestFromTom(wm.forest, hostBag)  // nanoid; C7.5
  → planReconcile → planActionsToSteps
  → Forest-first RunSteps / restore (C7)
```

GetTree DBus uses `projectForest` for CLI/debug — **keep as Surface**.
Cold Apply seeds Forest then projects TOM (C6.6); no GObject planner
path.

## Substeps

| Sub | What | Files | Status |
| --- | --- | --- | --- |
| C6.1 | Snapshot from `wm.forest` + bag | `session-api.js`, `forest-apply-snapshot.js` | **done** |
| C6.2 | Plan/settle keys = nanoid | settle/open/slot + tile-select bag | **done** |
| C6.3 | Planner IR from TOM (adapter-first) | `forest-apply-snapshot.js` | **done** |
| C6.4 | Epochs + session portable = nanoid | tree-snapshot, session-layout | **done** |
| C6.5 | Nanoid session/H1 identity; Forest sync after GObject restore | session-layout-restore, monitor-recovery | **done** |
| C6.6 | Retire GetTree-as-planner-input | apply units | **done** |
| C6.7 | Brake | proto + apply vitest | proto **154**; C6.6 layout-cycle 35 |

**Judgement:** adapter-first for C6.3; no BC for old Meta-keyed disks
(D092); do not merge monitor-resolves; RunSteps→OpSet can wait C7.

**C6.5 landed:** portable `id` = nanoid; Meta = `metaWindowId` match
aid. Session save writes bag nanoid `focusWindowId`. **C7.7:** restore/H1
write Forest then paint; post-restore `syncForestFromTree` removed.

## Keep vs die

| Keep (Surface) | Die (planner input) |
| --- | --- |
| DBus GetTree / CLI dump | GObject `projectForest` as Apply planner input |
| Python layout oracle parked | Meta id as durable Apply/epoch key |
| ApplyEpoch home lock | |
