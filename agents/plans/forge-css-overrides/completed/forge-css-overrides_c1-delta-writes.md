# C1 — Prefs write delta-only user CSS

**Status:** done
**Plan:** [forge-css-overrides.md](../plans/forge-css-overrides.md)  
**Branch:** `plan/forge-css-overrides`  
**Updated:** 2026-08-06  
**Depends on:** C0 (done)

## Goal

When Appearance prefs change a color/width/radius, the **user** stylesheet should grow only the **changed** properties — not re-serialize a full fork of the theme. Optional: if the user file is still a full prior default, strip rules identical to current base on write or on one-shot migrate.

## In scope

| Area | Change |
| --- | --- |
| `setCssProperty` / `_updateCss` | After set, user file should contain only overrides vs base (or at least not reintroduce identical bulk from a full fork when writing a single prop) |
| Full-fork users | On write or explicit migrate: drop declarations that match base AST |
| Reset in Appearance | Reset should remove user override (so base shows) rather than writing base values into user file |
| Unit tests | set one color → user file has that selector/prop; other base-identical rules not required; reset clears override |

## Out of scope

- Full theming.md rewrite (C2)
- Live Shell matrix (operator)

## Acceptance

1. Starting from minimal user file (`/* forge user overrides */`), setting `.window-tiled-border` `border-color` produces a user file with essentially that rule (not full theme dump). ✅
2. Starting from a full-fork user file, changing one prop and saving does not permanently require keeping the entire fork forever — either strip-identical on write or documented migrate helper. ✅ (`_stripIdenticalToBase` on every `_updateCss`)
3. Appearance “Reset” for a color scheme removes the override (or restores cascade to base), not hardcodes default into user file as sticky override. ✅
4. Unit tests green; C0 dual-load still works. ✅ (2260 passed)

## Handoff (overwrite each session)

### C1 implement (Task Force A) — 2026-08-06

**Branch:** `plan/forge-css-overrides` (no wrap-up commit — orchestrator after B AGREE)

**Files**
- `lib/shared/theme.js` — `_stripIdenticalToBase` (on every `_updateCss`); `_removeUserCssProperty` / `removeCssProperty`; `setCssProperty` writes deltas only; set-to-base-value clears user override
- `lib/prefs/appearance.js` — border size/color Reset calls `removeCssProperty` (and related preview/tab props for color), not `setCssProperty(default)`
- `tests/unit/shared/theme.test.js` — 5 C1 cases: minimal set, full-fork strip, remove + base fallback, set-to-base, remove no-op

**Behavior**
- User AST is deltas only after any write; full-fork shrinks on first Appearance edit (or any set/remove that calls `_updateCss`).
- `getCssProperty` still user → base (C0).
- `patchCss` still non-destructive (C0).

**Verify**
1. `npm test` — 2260 green
2. Residual for B: Appearance multi-remove does multiple writes (same as prior multi-set); string equality only for strip (no color normalize); live Shell not exercised.

**Next:** Task Force B verify; then C2 docs/scripts.
