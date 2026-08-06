# C0 — Dual-load CSS + kill destructive patchCss

**Status:** ready  
**Plan:** [forge-css-overrides.md](../plans/forge-css-overrides.md)  
**Branch:** `plan/forge-css-overrides`  
**Updated:** 2026-08-06

## Goal

Stop treating the user stylesheet as a disposable full fork. Always load **bundled base** then **user file** (if present). Remove enable-time full overwrite of user CSS.

## In scope

| Area | Change |
| --- | --- |
| `ExtensionThemeManager.reloadStylesheet` | Load `defaultStylesheetFile` then `stylesheetFile` when both exist; unload both on disable path |
| `ThemeManagerBase.patchCss` | **No** copy of bundled → user when tag mismatches. At most: ensure user path exists (empty/minimal), optional rename migration hook (noop map OK), stamp `css-last-update` without clobber |
| `ThemeManagerBase._importCss` / `_getStylesheetFile` | AST for prefs: prefer user file for **writes**; for **reads** of missing rules, fall back to bundled AST (or import both and merge for getCssProperty) so Appearance still works if user file is color-only |
| `ConfigManager.loadFile` seed | Do **not** seed a full default copy into the user stylesheet path on first run (or seed empty/`/* forge user overrides */\n`). Window config seed unchanged. |
| Unit tests | patchCss never overwrites non-empty custom colors; dual-path helpers; getCssProperty falls back to base |

## Out of scope (C1+)

- Prefs writing only delta props (C1 may refine if C0 still writes full user AST)
- Docs/scripts polish (C2)
- Automatic strip of rules identical to base (C3)

## Acceptance

1. `patchCss()` with `css-last-update != cssTag` does **not** replace user stylesheet contents with bundled defaults (existing custom file preserved; may still update stamp).
2. `reloadStylesheet()` loads base then user when user file exists; only base when absent.
3. `unloadStylesheet()` unloads whatever was loaded (both if both).
4. Theme get/set still works: missing props in user file resolved from base for reads; `setCssProperty` persists into user file.
5. `npm test` / relevant unit suite green for theme/CSS changes.
6. No change to default palette in bundled `stylesheet.css` colors (structure OK).

## Handoff (overwrite each session)

(A fills after implement)
