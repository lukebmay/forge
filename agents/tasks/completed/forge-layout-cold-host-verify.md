# forge-layout-cold-host-verify — Host cold `layout dev` after logout (R036)

**Status:** done  
**Plan:** (none) · residual of R036 / SM1–SM7  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** Grok 4.5 (orchestrator + nest/host verify)  
**Regression:** [R036](../REGRESSIONS.md)

## Goal

Cold dual-mon desk matches `dev` **without killing GNOME**. Diagnosis and retest
are **nested Wayland** by default. Primary-session logout is **rare** (tip load
only after nest already green).

## Acceptance

- [x] Nest: mon=1 `_forge-test-clean` PASS; nest Shell still up
- [x] Nest: multi-open (`_forge-test-ghosttys` mon=2) does **not** kill nest
      Shell; place-hint INFO logs: provisional + map sticky **move=false** + late
      confirm + late idle move
- [x] L0 place-hint 34 + open-app-policy 34 + session-api-layout-cycle 24 +
      layout-apply-run 36 (**128**) green
- [x] Host cold `layout dev` **ok** + verify match; tree matches `dev`; no
      NoReply / session death
- [x] Journal: map sticky `move=false` on null chrome; late idle moves; chrome
      clear `all-hard`; no SEGV stack
- [x] Task → `agents/tasks/completed/`; HANDOFF/PRIORITY/REGRESSIONS updated

## Crash evidence (historical)

| Job / time | What |
| --- | --- |
| `20260817T021642Z-f380d0` | Host `layout dev` → GetLayoutApply **NoReply** mid chrome open |
| `20260817T023252Z-af18e4` | Again after “identity-ready” tip — same NoReply |
| Journal stack | `safeMoveToMonitor` ← sticky PlaceNext **move:true** at map → SEGV |

Root: map-time PlaceNext `move_to_monitor` on Wayland chrome null identity.

## Fix (shipped on disk this verify)

| Change | Path |
| --- | --- |
| No map-time PlaceNext `move_to_monitor` (sticky grace only) | `window.js` track sticky |
| Late adopt: tree reparent + idle Meta move | `window.js` |
| Loading titles not identity-ready | `place-hint.js` |
| INFO place-hint logs | `window.js` |

## Session note (PASS 2026-08-16)

Fresh Wayland session post-reinstall (Guake agent). Tip
`v49-90-beta.2-335-gf30e8c9-dirty` apiVersion 10.

| Layer | Result |
| --- | --- |
| L0 | 128 green (place-hint / open-app-policy / layout-cycle / apply-run) |
| Nest mon=1 clean | **PASS** |
| Nest mon=2 ghosttys | First apply open-miss (map flake); re-apply after clean **PASS**
      open pinned 2/2, verify match; Shell up |
| Nest place-hint | `map sticky … move=false`; provisional; late confirm; late idle
      move mon→1 |
| Host cold `layout dev` | **ok** · open 7/7 · hard-ready · verify match · chrome clear
      **all-hard** |
| Host tree | mon0: TABBED(Chrome,Grok) \| ghostty; mon1: ghostty \|
      TABBED(YouTube,Gmail,Voice) |
| Host journal | All chrome PWAs sticky **move=false**; late idle mon→1; no SEGV |

### Next

- Tab work D0 (plan first) — [forge-tab-work-planning](../forge-tab-work-planning.md)
- Do **not** reintroduce map-time PlaceNext `move_to_monitor`
- Commit SEGV fix when human asks (still dirty on master)
