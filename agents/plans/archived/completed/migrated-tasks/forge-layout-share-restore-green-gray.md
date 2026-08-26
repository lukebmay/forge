# forge-layout-share-restore-green-gray — Custom split width save/restore

**Status:** done
**Plan:** (none) — regression vs shipped SZ1–SZ3 ([forge-layout-sizes](../../plans/forge-layout-sizes.md)) · **R038**
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-18

## Goal

Custom split widths (`share` / sibling `percent` + `userSized`) save and
restore correctly on every host. **Working:** hostname `green`. **Broken:**
hostname `gray`. Fix in this repo on `black`; prove with green vs gray evidence.

## Acceptance

- [x] Diff why green restores custom split widths and gray does not (profile
      JSON, forge tip/version, apply path, GetTree percents).
- [x] Root cause named (save omit / desugar drop / ensure_sizes skip /
      Move wipe / apply size no-op / host tip stale / profile shape).
- [x] Code fix on `black` (master) so the failure class cannot recur.
- [x] Unit regression: save→desugar→plan `ensure_sizes`→apply shares for a
      custom unequal split (and any gray-shaped fixture found).
- [x] Live prove: on gray (after install tip if needed) resize →
      `forge layout save <name>` emits `share` → `forge layout <name>` restores
      percents ±ε; green still OK (no regression).
- [x] Session note + HANDOFF/PRIORITY touch if status changes; REGRESSIONS row
      if this is a product regression (R0xx).

## Context for the next agent (complete + succinct)

### Root cause (R038)

Same tip on green/gray. Sugar shape differed:

| Host | Sugar | IR |
| --- | --- | --- |
| green | `{tiles:{mon0:{hsplit:[…], share:[…]}}}` | mon0 `split`+`share` |
| gray | `{tiles:[{hsplit:[…], share:[…]}]}` | mon0 → sole child CON `s0` with nested `split`+`share` |

Desugar treated bare sole `[{hsplit|vsplit}]` as one pane → extra CON. Live
tree is mon HSPLIT of (tab \| ghostty) → structure mismatch → thrash /
hard-fail; shares did not stick on the intended siblings.

Save already refused single-mon `{hsplit}` → bare `[{hsplit}]` (see
`_tiles_to_bare_array`); gray file was the broken shape (older/round-trip gap).

### Fix

In `desugarTiles` / `_desugar_tiles`: when mon body is a **length-1 array**
whose sole item is tagged `hsplit`/`vsplit`, lift to mon-level split + share
(same as `{monN:{hsplit…}}`). Nested intentional shares under multi-pane mons
unchanged.

Paths: `lib/shared/layout-plan.js`, `scripts/forge/layout_plan.py`.

### Prove

| Check | Result |
| --- | --- |
| L0 | `TestShareSugar` (incl. gray fixture) + layout_plan/save/apply **363**; Vitest normalize/reconcile **66** |
| Nest | `_forge-test-share-gray` bare `[{hsplit,share}]` dual ghostty → pct **0.691/0.309** `SHARE_OK`; nest stopped |
| Gray | Profile rewritten mon-keyed; `layout dev` **ok** · tab **0.691** / ghostty **0.309** userSized; verify match |
| Green | `layout dev` **ok** · **0.687/0.313** still |

### Residual

- Gray/black Wayland host Shell need **logout** to load dirty tip for bare-array
  ApplyLayout on host (nest already loaded tip). Gray profile is mon-keyed now
  so loaded tip restores without bare-array path.
- Desktop Icons may appear as mon residual on gray (marginal coexist) — unrelated.

## Session note

**Done 2026-08-18.** R038. Lift sole bare `{hsplit|vsplit}` in desugar (JS+Python).
No hostname branches. No commit/push.
