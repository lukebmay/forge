# Task: forge-layout-control-loop_cl7-pwa-open-wait

**Status:** done (code) — operator CL7 retest pending  
**Owner:** agent / human (live)  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Unblocks:** CL7 live `forge layout dev` (partial opens + Grok timeout)

## Goal

Fix `forge layout dev` open pipeline for Chrome PWAs (Grok, YouTube, Gmail,
Google Voice, …) so wait + PlaceNext + residual match succeed when Meta reports
`chrome-<appid>-Default` / `crx_<appid>` instead of sugar `Google-chrome`.

## Live symptom (black, post-login sole Ghostty)

```text
forge layout: open failed role='Grok': wait timeout after 15000ms (timeout)
seenClasses: ["chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default"]
wmClassCandidates: [crx_…, chrome-…-Default, google-chrome, Grok]
open.wmClass (plan sugar): Google-chrome
```

- Main `google-chrome` open **ok** (class `google-chrome`).
- Grok launch **ran** (desktop resolved) but wait only accepted explicit
  `Google-chrome` → timeout; remaining opens aborted early.
- ~15s hang is the wait poll, not Shell thrash.

## Root cause

1. Sugar (`layout_plan._infer_open_and_match`) sets `open.wmClass = Google-chrome`
   for PWA tokens (Grok, YouTube, …).
2. `do_launch` treats explicit `wm_class` as the **only** wait class and sets
   `accept_any_new=False`, **discarding** `infer_wm_class_hints` (StartupWMClass
   + desktop stem).
3. Real Meta class is desktop stem `chrome-<id>-Default` (desktop file declares
   `StartupWMClass=crx_<id>`). Neither equals `Google-chrome`.
4. Open loop **returns on first open failure** → mon1 roles never launched.
5. Residual/reuse match uses `_class_eq` without chrome-PWA family → already-open
   PWAs may not claim next run.

## Plan of action

| # | Change | Where |
| --- | --- | --- |
| 1 | Merge desktop `class_hints` + explicit into `wait_classes` | `scripts/forge/forge` `do_launch` |
| 2 | Prefer specific PWA class for PlaceNext (`chrome-*-Default` / `crx_*`) over sugar `Google-chrome` | `do_launch` + `infer_wm_class_hints` order |
| 3 | Chrome family / same app-id equality (browser ↔ crx ↔ chrome-id-Default) | `layout_plan._class_eq`, `forge._class_eq`, `place-hint.js` `wmClassEqual` |
| 4 | Continue remaining opens after one failure; pin successes; fail at end if any open failed | `cmd_layout` open loop |
| 5 | Unit tests: hints merge, wait candidate list, class_eq PWA, open-loop continue | `tests/unit/cli/…`, place-hint JS |
| 6 | Install debug build for operator re-test of CL7 (`forge layout dev`) | `./install` |

## Non-goals

- Changing host `dev.json` profile (sugar stays).
- Soft-rehome rename / Wayland stash.
- Full redesign of open pipeline.

## Acceptance

1. [x] Unit tests green for new class/wait/place behavior (CLI 358 + place-hint 24).
2. [x] `do_launch` with `wm_class=Google-chrome` + Grok desktop waits on
   `chrome-…-Default` / `crx_…` candidates (not only Google-chrome).
3. [x] PlaceNext class for PWA launch is specific, not bare Google-chrome when desktop known.
4. [x] `window_matches` / place-hint: `Google-chrome` matches `chrome-<id>-Default` and
   same-id `crx_` ↔ `chrome-` forms.
5. [x] Open loop continues after a failed role (pure bookkeeping test + code path).
6. [ ] Operator: sole Ghostty → `forge layout dev` opens all roles without Grok wait timeout.

## Session note

**2026-08-05 (A implement + B AGREE + wrap-up):** On `plan/forge-layout-control-loop`.

### Shipped
- **`_class_eq`** (forge + layout_plan) + **`wmClassEqual`** (place-hint): casefold,
  reverse-DNS stem, same Chrome app id (`crx_<id>` ↔ `chrome-<id>-Default` /
  profile-ish), browser sugar ↔ PWA (never distinct PWA↔PWA).
- **`infer_wm_class_hints`**: from `StartupWMClass=crx_*` or Exec `--app-id=`,
  emit `chrome-<id>-Default` first then `crx_<id>` (exact casefold dedupe).
- **`merge_launch_wait_classes` / `prefer_launch_place_class`**: hints first +
  explicit; PlaceNext prefers Meta `chrome-*-Default` / `crx_*` over sugar.
- **`do_launch`**: wait list merge; `accept_any_new` only when no wait classes.
- **Open loop**: continue after failed role; pin successes; residual/quiet; fail
  at end if `still_open` or `open_failures`; LayoutBatch `finally` unchanged.

### Key paths
- `scripts/forge/forge` — helpers, `do_launch`, open loop
- `scripts/forge/layout_plan.py` — `_class_eq` family
- `lib/extension/place-hint.js` — `wmClassEqual` + chrome helpers

### Tests
- `tests/unit/cli/test_forge_class_eq.py` (new)
- `tests/unit/cli/test_layout_plan.py` — `TestClassEqChromeFamily`
- `tests/unit/extension/place-hint.test.js` — chrome PWA cases
- **All green:** pytest `tests/unit/cli/` 358; vitest place-hint 24

### Next (operator)
- Debug install done (or re-run `./install`); sole Ghostty → `forge layout dev`
  (Grok must not 15s-timeout; mon1 PWAs launch).
