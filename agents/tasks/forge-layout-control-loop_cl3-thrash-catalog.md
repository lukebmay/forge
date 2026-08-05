# Task: forge-layout-control-loop_cl3-thrash-catalog

**Status:** ready  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05

## Goal

Land an **in-memory app thrash catalog** (v1) with **built-in Ghostty** defaults
and hooks so thrashy classes get **extra verify** (and optional min quiet floors).
Observation counters can raise thrashScore; do not silently drop below built-in
without evidence. Full open-path batch quiet is **CL4** — CL3 supplies the catalog
API and integrates extra verify after settle when `needsExtraVerify`.

## Acceptance

1. **Module** e.g. `lib/extension/app-thrash-catalog.js` (name OK if clear):
   - Per `wm_class` (and optional stem): `seenOpens`, `postMapSizeChanges`,
     `postApplyDrift`, `thrashScore`, `minQuietMs`, `builtIn`, `needsExtraVerify`.
   - Built-in table: `com.mitchellh.ghostty` / `ghostty` → needsExtraVerify,
     minQuietMs in 150–300ms range (named constants).
   - `lookup(wmClass)` / `recordOpen` / `recordPostMapSizeChange` /
     `recordPostApplyDrift` (pure enough for unit tests).
   - thrashScore derivation documented; above threshold → needsExtraVerify true.
   - Built-in flags cannot be cleared by low observation alone.
2. **Wire into control loop (minimal CL3 surface):**
   - After verify reaches SETTLED, if any managed TILE class `needsExtraVerify`,
     schedule **one extra** `requestVerify("thrash-extra")` (or similar) once per
     settle wave (latch so it does not loop forever).
   - Optional: LayoutController holds catalog instance; WM constructs it.
   - Do **not** replace createDelay open path yet (CL4 uses minQuietMs).
3. **Attribution:** postMap / postApply counters must ignore Forge-suppressed
   geometry (use existing suppress / isForgeCaused helper). Provide record hooks
   callable from external geometry path when not forge-caused (light touch —
   may only count if signal path already external).
4. **Unit tests** (thorough):
   - Built-in ghostty lookup by class and stem
   - Score rises with postMapSizeChanges / postApplyDrift
   - needsExtraVerify sticky for built-in
   - SETTLED + thrashy → one extra verify, not infinite
   - Suppress path does not inflate postApplyDrift
5. **`npm test`** green.
6. No soft-rehome rename; no open createDelay replace (CL4); no disk persistence
   required (v1 memory only).

## Out of scope

- CL4 open = batch N quiet gates using minQuietMs
- CL5 layout CLI batch
- Persist heuristics JSON (v2)

## Session note

(ready — not started)

**Git:** Stay on `plan/forge-layout-control-loop`. Leave wayland-live stash alone.
