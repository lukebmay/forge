# Task — T1: Tab/stack chrome reliability (no empty gap)

**Status:** Done  
**Plan:** [forge-daily-driver.md](../../forge-daily-driver.md)  
**Analysis:** [forge-layout-thrash-analysis.md](../../forge-layout-thrash-analysis.md) § stack labels  
**Priority:** P1  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-daily-driver/completed/`

## Problem

User observed **real** missing labels — not “wrong format”:

1. Only **one** label when there should be two.
2. **No** labels — only a **gap** (desktop background) where the tab/stack bar should be.

Code path (analysis):

- `_createWindowTab()` early-returns if `!this.app`.
- `processNode` clears decoration children every render; only re-attaches existing tabs.
- `_applyDecorationRect` still **shows** the host and reserves height when
  `showtab-decoration-enabled` + tiled children, **even if zero tabs attached**.

## Goals

**Invariant:** If parent layout is TABBED or STACKED, showtab is on, and there is
≥1 tiled child, then **every** tiled child has a label actor (fallback allowed).
Never show an empty decoration strip / never reserve bar height with zero labels
attached without placeholders.

1. Build fallback tab when `!app` (generic icon + title or wm_class).
2. Self-heal after deco rebuild if child count mismatch.
3. Same path for STACKED (shared chrome) even if stack is default-off.
4. Unit/regression tests for null-app multi-window tabbed group.

## Code touch list

| Area | Symbols / files |
| --- | --- |
| Tab create | `lib/extension/tree.js` → `_createWindowTab`, `_ensureConTab`, `_buildTabBase` |
| Apply bar | `processStacked`, `processTabbed`, `_applyDecorationRect`, `processNode` |
| App refresh | `refreshApp` / `notify::wm-class` in `window.js` (already partial) |
| Tests | new or extend under `tests/unit/tree/` or `tests/regression/` |

## Acceptance

- [x] Two windows in TABBED with one (or both) missing Shell.App still show **two** labels
- [x] No empty reserved strip with desktop showing through when showtab on
- [x] Reparent / decoration self-heal path still safe (no dispose UAF)
- [x] Regression test(s) green; `npm test`
- [x] Plan + task notes updated

## Out of scope

- Multi-line tab wrap (T9)
- Soft rehome (T3)
- Full decoration rewrite to separate module (nice-to-have only if needed)

## Session note

**T1 done (A/B, 2026-07-24)** — TF-B **AGREE**. Fallback tabs + self-heal shipped.

- `lib/extension/tree.js`: `_buildTabBase(null)` → generic
  `application-x-executable-symbolic`; `_createWindowTab` no longer bails on
  `!app` (`_tabFallback`); `_ensureConTab` without `rep.app`; `_getTitle` /
  `_titleForMeta` → title → app → wm_class → `"Window"`; `refreshApp` upgrades
  fallback; `processNode` STACKED/TABBED ensure WINDOW tabs; `_applyDecorationRect`
  one-shot ensure before attach.
- Tests: inverted v4u0/2uc0; `bug-t1-tab-chrome-null-app-multiwindow.test.js`;
  Tree-layout `_buildTabBase(null)`.
- `npm test`: 170 files / 1618 passed.
- Next: **T2** layout debug overlay.
