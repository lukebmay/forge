# forge-layout-cold-apply-structure — Cold ApplyLayout structure + soft (R036)

**Status:** ready  
**Plan:** (none) · residual of AL6/AL8 open + R033 aspect + R035 ensure  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Regression:** [R036](../REGRESSIONS.md)

## Goal

True-cold Wayland host `forge layout dev` exits **ok** with topology matching
the profile (not nested mon0 aspect thrash; mon1 multi-role tabs co-grouped),
soft settle finishes without max-corrections, verify structure+focus.

## Acceptance

- [ ] Root confirmed in code (attach path during LayoutBatch open; PH Meta;
      soft thrash only if still broken after structure)
- [ ] Cold multi-open does **not** aspect-split OP1 against pin/PlaceNext slots
      (product open/launch aspect still works outside apply)
- [ ] Layout placeholders do not throw on `windowHomeReconcile` /
      `get_workspace` (or equivalent Meta surface)
- [ ] `forge layout dev` cold: exit 0; mon0 `TABBED(chrome,Grok) | ghostty`;
      mon1 `ghostty | TABBED(YouTube,Gmail,Voice)` (or profile equivalent)
- [ ] Soft settle: no `soft focus: max corrections (32)` on that path
- [ ] L0: failing-then-green unit(s) for the chosen root(s)
- [ ] Nest: multi-open structure smoke (`_forge-test-*` only in matrix)
- [ ] Host: cold re-verify after install + logout tip (or nest if structure-only)
- [ ] Optional: CLI “nothing applied” wording when spine partially ran

## Work order (planning → implementation → testing)

### 1. Plan / investigate (read-only first)

1. Reproduce from job + tree evidence below (or fresh cold Guake/`FORGE_JOB`).
2. Trace map→admit→attach during ApplyLayout open while `LayoutBatch` depth > 0:
   - PlaceNext / pin dest for each role
   - `_maybeAspectSplitForOpen` / D032 wrap / bag attach
   - Whether LFT aspect runs when pin target already set
3. Trace PH stubs: `layout-placeholder.js` vs `windowHomeReconcile` callers.
4. Decide fix ownership (named API): suppress aspect mid-batch vs pin-only
   attach vs replan after open — **not** soft-focus band-aid first.

### 2. Implementation

- Prefer one contract: during layout apply open, map attach obeys **slot pin**,
  not dock OP1 aspect. Keep R033 for interactive open/launch.
- Complete PH Meta surface or skip reconcile for non-Meta nodes.
- Soft path: re-check after structure; only then touch soft focus if still thrashing
  (historical R014 class: GetTree must not stomp LTF).

### 3. Testing

| Layer | What |
| --- | --- |
| L0 | Open-attach with batch active + PlaceNext/pin → no VSPLIT thrash of ghostty slot; PH `get_workspace` safe |
| Nest | `forge nested run --` layout `_forge-test-clean` / multi-open profile; tree shape |
| Host | Logout tip if JS changed; cold `forge layout dev`; `forge tree` + job ok |
| Live matrix | Add `L1.r036-…` / tag R036 if not covered by existing cold cases |

```bash
# After fix install
./install --kit=vim
# Nest loop (no logout):
forge nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-clean'
# Host cold (logout if tip stale):
forge ping   # apiVersion 10
forge layout dev
forge tree
# Job dir: ~/.local/share/forge/jobs/<latest>/
```

## Context for the next agent (complete + succinct)

### Proven 2026-08-16 (host black, new Wayland session)

| Fact | Detail |
| --- | --- |
| Tip | Loaded: `g75da70e-dirty`, `apiVersion` 10 (logout worked) |
| Job | `~/.local/share/forge/jobs/20260816T031035Z-f91526` |
| Status | `failed` · `code=soft-error` · `soft focus: max corrections (32)` |
| Spine | skeleton ok → open **7/7 pinned** → bind 9 → order 9 → size → hard-ready 7 → focus 3 → **soft fail** |
| Spawn | Voice multi-word + YouTube Name pick **OK** (old open-miss/R034 path not this fail) |
| Mid-session contrast | Job `20260816T013931Z-b40786` **ok** soft corrections=2 verify match |
| CLI wording | stderr says “nothing applied” — **false**; windows opened and partial tree |

### Tree after fail (actual)

```text
mo0ws0 HSPLIT
  TABBED [chrome Fantasy…, Grok]
  VSPLIT
    HSPLIT [ghostty agent, Google Voice]
    YouTube
mo1ws0 HSPLIT
  ghostty
  TABBED [Gmail]   # only one tab child
```

### Expected (`dev` black)

```text
mon0 HSPLIT: TABBED(chrome, Grok) | ghostty
mon1 HSPLIT: ghostty-2 | TABBED(YouTube, Gmail, Voice)
focus: ghostty
```

### Journal clues (~23:10:35)

- mon0 right: ghostty alone under VSPLIT → HSPLIT sibling wrap (aspect path)
- `windowHomeReconcile`: `TypeError: metaWindow.get_workspace is not a function`
- post-render `verify mismatch 3/7` `rect-mismatch` (sample chrome id)
- Desktop Icons 1/2 admitted during apply

### Not the primary story

- R035 residual ensure shipped; mid-session mon1 tab group worked earlier
- This cold fail is **structure during open** + soft secondary, not “ensure never planned”
- Do not re-port planner to CLI; product path remains ApplyLayout (D037)

### Paths to open first

- `lib/extension/window.js` — open aspect / attach / batch
- `lib/extension/session-api.js` — ApplyLayout open/pin spine
- `lib/extension/layout-placeholder.js` — PH Meta stubs
- `lib/shared/layout-open.js` — spawn (already OK for multi-word)
- Soft: layout-controller / focus settle (only after structure)

## Session note

2026-08-16: Host cold diagnose only (no code fix). PRIORITY + HANDOFF + R036
filed for handoff. Operator asked priorities + commit/push.
