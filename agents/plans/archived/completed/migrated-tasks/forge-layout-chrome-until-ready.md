# forge-layout-chrome-until-ready — overlay until apply is done (R027)

**Status:** done  
**Plan:** (none)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15

## Goal

While `forge layout` still owns focus/soft residual, show the loading
overlay and **block pointer**. After the command returns, the user may
click (R026 adopts a live pin).

## Acceptance

- [x] `LayoutBatch chrome-show` shows overlay without a batch
- [x] CLI shows chrome at apply start, including no-open
- [x] CLI clears chrome after focus/soft (finally)
- [x] Scrim is reactive and eats pointer events
- [x] First-ever soft wait on a new host seeds from another host’s same
      class when the heuristics file already has samples
- [x] Live: nest tip `g4740ba5` — real `layout _forge-test-ghosttys`
      logs `layoutChromeShow: {ok,shown:true}`; after return
      `chrome-clear` → `cleared:false` (already cleared). L0 chrome
      units green. Pointer eat is L0 (scrim reactive); no xdotool for
      host click-through visual.

## Context for the next agent (complete + succinct)

- **Phase:** apply chrome lifetime + first-ever timeout seed. Not
  structure.
- **Why overlay was gone:** chrome only on LayoutBatch begin (opens
  path). Warm `layout dev` does no opens → no overlay. Scrim was
  `reactive: false` so clicks went through even when visible.
- **Why every boot felt first-ever:** heuristics keys include hostname.
  Green has no `green|*` rows; black’s samples were ignored. Persist
  still writes after the first green apply. Seed uses peer host same
  class for the *wait only*; green still records its own trials.
- **Not skipped by persist:** launching Chrome/Grok on a cold desk;
  hard-ready TILE (~5s cap); 2s cold focus floor when we opened apps.
- **Super+Space:** not this file. Vim kit now binds Run to Super+Space;
  `./install` does not re-apply kits. On green: `forge keybind load vim`.
- **Enable/test:**

```bash
npm test -- tests/unit/extension/session-api-layout-cycle.test.js \
  tests/unit/extension/layout-apply-chrome.test.js
python3 -m pytest tests/unit/cli/test_settle_heuristics.py \
  tests/unit/cli/test_live_matrix.py -q
```

## Session note

**2026-08-15 residual closed (nest live).**

| Check | Result |
| --- | --- |
| L0 | `layout-apply-chrome` + layout-cycle + settle heuristics green |
| Nest tip | `./install --kit=vim` → `v49-90-beta.2-323-g4740ba5` |
| chrome-show/clear | DBus `shown:true` / `cleared:true` on nest |
| Real apply | `forge layout _forge-test-ghosttys` → `layoutChromeShow.shown=true` |
| After apply | `chrome-clear` → `cleared:false` (finally already cleared) |
| Nest stopped | `running: False` |

**Not run:** host personal `layout dev` with eyes + click-through (no
xdotool; Wayland host Shell tip needs logout after install). Product
path is the same LayoutBatch chrome as nest.

2026-08-13: operator on green — overlay should stay if they must not
click; load times should not pay 6s first-ever every boot; Super+Space
is Run (empty command = GNOME Run).
