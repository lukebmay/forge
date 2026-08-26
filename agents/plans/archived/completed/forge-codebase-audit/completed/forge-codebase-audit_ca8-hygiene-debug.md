# Task: CA8 — Dead debug helpers + comment trim

**Plan:** [forge-codebase-audit.md](../plans/forge-codebase-audit.md)  
**Status:** done (A/B AGREE)  
**Risk:** low  
**Mode:** A/B implement–verify  

---

## Goal

Remove unused debug-only tree helpers **if** nothing production-calls them; otherwise keep (Logger.debug-gated is OK). Optionally early-return `debugParentNodes` when logging is disabled so focus path does not walk the tree for no-op. Trim thrash-era verbose comments on files already touched in CA4–CA7 (comments.md: short *why* only).

---

## Primary files

- `lib/extension/tree.js` — `debugNode` / `debugParentNodes`
- `lib/extension/focus.js` — sole known caller of `debugParentNodes`
- Recently extracted: `tree-layout.js`, `soft-rehome.js`, `session-layout-restore.js` (comment trim only)
- `lib/shared/logger.js` — `isDebugEnabled()` for gate

---

## Notes

- Grep: `debugParentNodes` is called from `FocusManager.movePointerWith` — **not unused**. Prefer keep + gate on logging enabled rather than delete.
- Do not remove `Logger.debug` banners in `render` unless clearly noise-only and unused value.
- No mass comment rewrite across repo.

---

## Acceptance

- [x] Grep: no production callers of **removed** symbols (if any removed) — none removed; both helpers kept
- [x] comments.md style on touched blocks (short; no thrash novels)
- [x] Full `npm test` green (184 files / 1868 tests)
- [x] Task + plan session notes updated

---

## Out of scope

- prefs experimental flags
- Mass comment rewrite
- CA9 metrics (next)

---

## Test plan

```sh
npm test
```

---

## Session note

**CA8 B (2026-07-26):** **AGREE.** Verified: no symbols removed (only gate); `isDebugEnabled()` === former `debug()` threshold (`#level > INFO`); early-return skips ancestor walk when debug off; comment trims leave shield/strict-mon/richness/majority-align/userSized/Waydroid/Bug#330 policy notes; layout/session/soft-rehome diffs are comment-only. `npm test` 184/1868 green.

**CA8 A (2026-07-26):** Keep `debugNode` / `debugParentNodes` (caller: `focus.js` `movePointerWith`). Gate both via new `Logger.isDebugEnabled()` so focus path skips ancestor walk when debug off. No dead helpers removed. Comment trim on CA4–CA7 extracts + thin tree.js JSDoc.
