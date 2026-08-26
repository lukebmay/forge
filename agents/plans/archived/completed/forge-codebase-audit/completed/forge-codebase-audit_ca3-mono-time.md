# Task: CA3 — `monoTimeUs()` helper

**Plan:** [forge-codebase-audit.md](../plans/forge-codebase-audit.md)  
**Status:** implemented (await B)  
**Risk:** low  
**Mode:** A/B implement–verify  

---

## Goal

Collapse repeated monotonic-time fallback copies in session/shield/hold paths into a single `monoTimeUs()` helper. Behavior identical.

---

## Primary files

- Prefer `lib/extension/utils.js` (or small pure helper if cleaner)
- Call sites in `lib/extension/window.js` (session/shield/hold/soft-rehome)

---

## Acceptance

- [x] Single helper used by all session/shield/hold mono-time sites in window.js (the 14× pattern inventory)
- [x] Behavior identical (same fallback if GLib unavailable in tests)
- [x] `npm test` green
- [x] No restore/rehome policy changes
- [x] Task + plan session notes updated

---

## Out of scope

- Other DRY (move_to_monitor — CA5)
- Extractions (CA4+)
- Regression-test local mono copies (not production paths)

---

## Test plan

```sh
npm test
```

Optional: tiny unit test only if the helper is pure and non-trivial.

---

## Session note

**2026-07-25 (CA3 A):** Shipped.
- Added `monoTimeUs()` in `lib/extension/utils.js` — same `GLib.get_monotonic_time` vs `Date.now()*1000` fallback.
- Replaced **8** call sites in `window.js` (shield active/reapply, save queue/hold/save stamp, restore freshness + shield start). No remaining `get_monotonic_time` in `lib/` outside the helper.
- Policy timings unchanged (hold 12s, shield +3s, richness skip).
- `npm test`: 184 files, 1868 tests passed.

**For B:** Confirm all session mono paths go through helper; no behavior drift in hold/shield/freshness; leave CA4+ alone.
