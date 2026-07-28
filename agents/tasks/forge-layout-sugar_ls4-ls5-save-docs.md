# Task: LS4 + LS5 — save bare array + docs/demo rewrite

**Plan:** [forge-layout-sugar.md](../plans/forge-layout-sugar.md)  
**Status:** ready  
**Pri:** P0 layout-sugar track

## Scope

### LS4 — `layout save` emits bare array when possible

- Prefer top-level bare JSON array + string cells when safe.
- No empty `floating: []`, no mon keys when index order is enough.
- Only promote to object form / `tiles` / rich cells when needed for fidelity (floating, metadata, non-index mon keys, non-inferable match).
- Must round-trip through `normalize_profile` + plan for typical dual-mon desk.
- Keep description handling from LS7–LS8 (auto/store rules).

### LS5 — Docs + example rewrite

- User/docs and `scripts/forge/examples/` show bare-array happy path.
- Rewrite shellrc/black-style example toward lists-of-names (no mandatory class/title).
- Point `docs/user/layout.md` (or equivalent) at sugar; drop teaching tiles+monN as the default path.

## Out of scope

- LS3 best-effort park on malformed JSON (separate if large)
- STACKED product path
- Live black install rewrite of real host profile without user request (example/docs only unless a safe fixture)

## Acceptance

1. `forge layout save` on a dual-mon chrome+ghostty-like tree can emit a bare array of strings/tabs when inference is enough.
2. Saved bare array loads and plans (normalize + validate).
3. Object/`tiles.monN` still load (supersets).
4. Docs/examples demonstrate bare array first.
5. Unit tests for save compact form; layout suite green.

## Session note

(overwrite when implementing)
