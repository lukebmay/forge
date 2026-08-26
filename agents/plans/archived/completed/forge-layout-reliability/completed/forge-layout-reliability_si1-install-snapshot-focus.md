# forge-layout-reliability_si1-install-snapshot-focus

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

**Install/update must not use saved layouts.** Only snapshot the **current exact
tree** (structure + mon + tab/stack order + **open leaf** + **keyboard focus**)
and restore that after Shell reload.

## Live report

User was browsing **Chrome** (not Grok) in mon0 tab group; after `forge install`,
**Grok** became active/focused instead of the open Chrome window.

## Product rule (locked)

| Install/update | Layout profiles (`forge layout`) |
| --- | --- |
| `session-layout.json` from live tree only | Named profiles under `layout/` |
| No profile reconcile on install | Explicit user command only |
| Preserve focus + lastTabFocus + order | Desired-state open/move/claim |

## Hypotheses

1. Deferred `focus-update` queue leaves **stale `lastTabFocus`** (Grok) at save flush
   while Mutter focus is already Chrome.
2. Restore raises group `lastTabFocus` then fails to re-activate saved
   `focusWindowId` (resolve miss / thrash).
3. Match remaps focus id to wrong Chrome sibling after title churn.

## Acceptance

- [x] Save flush **synchronously** records keyboard focus window id and sets
      each focused window’s parent `lastTabFocus` before portable write.
- [x] Restore activates **saved focusWindowId** (not profile/active sugar); open
      leaf per CON from saved `lastTabFocusId`.
- [x] Install path still does **not** invoke `forge layout` / profiles.
- [x] Unit tests: stale lastTabFocus corrected on save; restore prefers
      focusWindowId over wrong lastTab when both set.
- [x] Docs one-liner: install = tree snapshot only (DESIGN or troubleshooting).

## Non-goals

- Layout mon thrash (LF3/LF4).
- Changing bare-array layout sugar.

## Session note (A)

**Root cause:** On save, portable forest took tree `lastTabFocus` as-is while
`focus-update` can lag Mutter (~220ms deferred). Install flush could write
`lastTabFocusId=Grok` even when keyboard focus was Chrome; restore raised the
stale open leaf. LFT fallback for null focus was separate but secondary.

**Shipped (no commit):**

| Path | Change |
| --- | --- |
| `lib/extension/session-layout.js` | `syncLastTabFocusFromFocus`, `resolveFocusMetaForSessionSave` |
| `lib/extension/session-layout-restore.js` | sync before snapshot; focus id from same meta; restore re-pins open leaf + activate focus last |
| `lib/extension/session-api.js` | GetTree CLI fallback syncs open leaf from Mutter focus |
| `tests/unit/extension/session-layout.test.js` | SI1 save + raise tests |
| `docs/DESIGN.md`, `docs/user/troubleshooting.md` | install = tree snapshot only |

**Verified:** install scripts call `save-session-layout` only (`_lib.zsh`).  
**Tests:** `session-layout.test.js` 33 + `tests/unit/extension` 263 green.  
**Next:** Task Force B verify; live `forge install` with Chrome open in mon0 tabs.

## Verifier (B)

**Verdict: AGREE**

### Acceptance check

| Criterion | Result |
| --- | --- |
| Save flush syncs keyboard focus → parent `lastTabFocus` before portable write | **Pass** — `saveSessionLayoutForReload` calls `resolveFocusMetaForSessionSave` + `syncLastTabFocusFromFocus` before `snapshotTree` / `toPortableForest`; `focusWindowId` from same `focusMeta` |
| Restore activates saved `focusWindowId`; open leaf from `lastTabFocusId` | **Pass** — existing resolve + raise walk; SI1 adds final `activateSessionFocus` + tree pin via `syncLastTabFocusFromFocus` so stale group open leaf cannot win |
| Install does not run `forge layout` / profiles | **Pass** — `scripts/forge/_lib.zsh` only `forge save-session-layout` before HUP |
| Unit tests: stale lastTabFocus on save; restore prefers focus | **Pass** — 4 new cases (resolve prefer/fallback, sync correct + orphan no-op, raise prefers focus) |
| Docs one-liner | **Pass** — `docs/DESIGN.md`, `docs/user/troubleshooting.md` |

### Code review

- `syncLastTabFocusFromFocus` correctly walks to nearest TABBED/STACKED parent; no-ops on orphans.
- `resolveFocusMetaForSessionSave` unifies Mutter focus → display → LFT (old LFT-only focusWindowId fallback preserved inside resolver, not after a wrong focus id).
- Restore order: group open leaves first, **then** keyboard focus activate + pin — matches product rule when `lastTabFocus` and focus disagree.
- Primary install path: `SaveSessionLayout` → `flushSessionLayout` → SI1 save path (not profile reconcile).

### Tests re-run (B)

```
vitest tests/unit/extension/session-layout.test.js → 33 passed
vitest tests/unit/extension → 263 passed (15 files)
```

### Non-blocking notes (not DISAGREE)

1. **GetTree fallback** (`session-api.js`) syncs from `focusMetaWindow` only — does not call `resolveFocusMetaForSessionSave` (no display/LFT). Fine while `SaveSessionLayout` is primary; full parity would share the resolver.
2. **`_scheduleSessionFocus` deferred idle** re-activates focus but does not re-call `syncLastTabFocusFromFocus` (raise path already pins; shield reapply also pins). Defense-in-depth only.
3. **Live gate** still needed: `forge install` with Chrome open (not Grok) in mon0 tab group — unit coverage cannot prove Mutter timing.

### Risks

- If `focusMetaWindow` itself is wrong (not only deferred lastTabFocus), save still writes that wrong id until display/LFT fallbacks apply (only when focus is null).
- Same-class Chrome tab title churn can still remap `focusWindowId` (hypothesis 3); out of SI1 scope.

**No DESIGN-FLAW.** Ready for wrap-up commit on `plan/forge-layout-reliability` after orchestrator.
