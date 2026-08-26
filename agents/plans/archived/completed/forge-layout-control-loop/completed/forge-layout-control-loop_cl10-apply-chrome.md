# Task: forge-layout-control-loop_cl10-apply-chrome

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../../forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Depends on:** CL8–CL9  
**Created:** 2026-08-05  
**Completed:** 2026-08-05

## Goal

Optional **layout-apply chrome** (soft scrim/mask) while multi-open residual apply
runs — disablable setting. **FIRM: must never stick.**

## Scope

| In | Out |
| --- | --- |
| GSettings bool (default **off** for safety until proven) | Wayland-only path |
| Show chrome at LayoutBatch begin or before residual (layout path) | Complex theming |
| Hard max lifetime timer always clears chrome | Soft-rehome rename |
| Clear on batch end, release, disable(), error paths | |
| Unit-testable pure timer/state helpers where possible | |

## Design (never-stuck is non-negotiable)

1. Setting: `layout-apply-chrome-enabled` (boolean, **default false** — opt-in).
2. When enabled and LayoutBatch depth ≥ 1 (**show on begin**): non-reactive dim on
   `Main.uiGroup`.
3. **Hard clear:** `GLib.timeout_add` **8000 ms** always removes chrome; also clear
   on `endOpenLayoutBatch` depth 0, `disable()`, show-failure path.
4. Show/clear idempotent; hard timer armed once until clear.
5. Pure state machine: `shouldShowChrome`, `transitionShow` / `transitionClear`,
   `ApplyChromeController`.

## Acceptance

1. Setting exists in schema + settings-keys; default **false**. ✓
2. When enabled, chrome can show during layout batch apply path. ✓
3. Hard timeout always clears even if batch never ends. ✓
4. disable() clears chrome + cancels timer. ✓
5. Unit tests for state machine / hard clear logic. ✓
6. Docs note in troubleshooting or architecture. ✓
7. Local commit; no push. ✓

## Session note

**2026-08-05 (CL10 done — Task Force A):**

- New `lib/extension/layout-apply-chrome.js`: pure transitions +
  `ApplyChromeController` + `LayoutApplyChrome` (non-reactive St scrim).
- Schema `layout-apply-chrome-enabled` default false; settings-keys development;
  prefs Debugging checkbox.
- `wm.beginOpenLayoutBatch` / `endOpenLayoutBatch` / `disable()` sync/clear.
- Docs: architecture CL10 + troubleshooting enable/hard-clear.
- Tests: vitest **2126** (11 new); whitelist complete.
- Trial: `gsettings set org.gnome.shell.extensions.forge layout-apply-chrome-enabled true`
- Next: **CL11** live retest X11 `forge layout dev`.
