# Task: forge-layout-apply-contract_ac4-placeholder-isolate

**Status:** done  
**Plan:** [forge-layout-apply-contract.md](../../forge-layout-apply-contract.md)  
**Branch:** `plan/forge-layout-apply-contract`  
**Created:** 2026-08-07  
**Completed:** 2026-08-07  
**Depends:** AC2 (epoch) done; AC3 done  
**Host:** black — unit tests only (Wayland; no live install/HUP)

## Goal

Implement **local thrash / failed-open isolation**: never thrash the forest.
When a role fails or thrashes after residual budget, **float** the bad client (if
mapped) and put a **placeholder** in the reserved tree slot. Closing the
placeholder drops the leaf and reflows siblings once (plan §8).

## Policy (locked)

```text
thrash(W) or role failed-open →
  stop fighting W (no reassert war — already true after AC1)
  float W if still mapped (TILE → FLOAT)
  insert PLACEHOLDER in reserved slot
  wave continues for everyone else
```

Close placeholder (product path) → remove node → one intentional reflow.

## MVP (lean, unit-testable)

North star is a real Forge window; **this task may ship St/actor or tree-only
placeholder** if a full GTK helper would block unit progress — but:

1. Placeholder must be a **first-class tree leaf** (`placeholder` flag and/or known class/role).  
2. Must never be thrash-isolated or re-opened by layout as a profile app.  
3. Close/remove API must reflow siblings once via normal layout commit.  
4. If St actor only: expose the same remove path the future GTK window will call.

### Thrash / fail triggers (AC4 minimum)

Define a clear, testable trigger — pick one solid path:

| Trigger | Behavior |
| --- | --- |
| Open/map **timeout** for a role (failed-open) | Placeholder in planned slot; no client |
| Optional: explicit `isolateThrashWindow(meta)` API | Float client + placeholder in its tree slot |

Do **not** implement multi-round residual chase. Residual epoch (AC2) already
accepts client snap; thrash here means **budget exhausted** or **never admissible**.

If open-timeout isolate already partially exists, wire placeholder into it rather
than inventing a second path.

## Scope (in)

1. Tree/schema: mark placeholder leaves; GetTree exports enough for CLI/debug.  
2. Isolate API (WM or controller): float + insert placeholder + requestLayout once.  
3. Remove placeholder → drop leaf + reflow.  
4. Unit tests: isolate floats client, slot has placeholder, remove reflows; placeholder not thrash-looped.  
5. Short docs note in architecture / DESIGN.

## Out of scope

- Full GTK `forge-placeholder` packaging polish (OK to stub spawn path)  
- Residual center/nudge (AC7) — later **cancelled**  
- Live visual QA (AC6)  
- Re-introducing verify reassert  

## Acceptance

1. Isolate path does not call forest reassert/mismatch war.  
2. After isolate, thrash client is FLOAT (or unmapped); slot has placeholder leaf.  
3. Remove placeholder → node gone + layout commit once (spyable).  
4. Unit tests green. No live HUP.  
5. Session notes updated.

## FIRM

- Branch `plan/forge-layout-apply-contract`  
- No push/SSH/secrets  
- Prefer small pure helpers + thin WM glue  
- DESIGN-FLAW → stop  
- High reasoning  

## Session note

**2026-08-07 Task Force A:** Implemented AC4 placeholder thrash isolate (MVP tree stub).

| Item | Detail |
| --- | --- |
| Module | `lib/extension/layout-placeholder.js` — pure plan/execute, stub, `PLACEHOLDER_WM_CLASS` |
| Tree | `placeholder` flag; `Node.isPlaceholder()`; `Tree.createPlaceholderLeaf`; getTiledChildren includes PH; apply/prune skip PH Meta |
| WM | `isolateThrashWindow` / `removePlaceholder` — float + insert + one `requestLayout`; never reassert |
| GetTree | `tree-query` exports `placeholder: true` (+ reason) |
| Verify | `collectTileVerifyInputs` skips placeholders |
| Tests | `tests/unit/extension/layout-placeholder.test.js` (18) + prune-dead still green |
| Docs | architecture.md, rendering.md, DECISIONS D006 |
| Commit | **not** by A (orchestrator after B AGREE) |

**Residual for AC5/AC6:** no open-timeout auto-wire into isolate yet (API ready); no GTK `forge-placeholder` process; no live visual QA at this slice. (AC7 nudge later **cancelled** 2026-08-08.)
