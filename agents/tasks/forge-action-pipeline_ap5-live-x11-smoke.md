# forge-action-pipeline_ap5-live-x11-smoke

**Status:** in progress (agent portion done — operator visual residual)  
**Plan:** [forge-action-pipeline](../plans/forge-action-pipeline.md)  
**Branch:** `plan/forge-action-pipeline`  
**Created:** 2026-08-06  
**Depends:** AP2+ (AP4 preferred)  

## Goal

Live X11 HUP smoke of action-pipeline formulas on black dual 4K.

## Matrix (from plan)

| Gesture | Expect |
| --- | --- |
| Click mon0 Ghostty | mon1 tabs no flash |
| Tab switch | raise + strip; no ¼ height |
| Focus keys | borders follow; no forest reflow |
| Move / swap / drag | one settle each |
| `forge layout dev` | open batch clean |

## Agent can do

1. `./install` (debug/production=false) + enable logging
2. `killall -HUP gnome-shell` on X11
3. Optional: `forge tree` / plan dry-run checks post-layout
4. Record journal / session-layout-trace if available

## Operator must confirm (visual)

- Cross-mon tab flash absent
- Tab switch height stable
- Focus/move/swap look correct

## Acceptance

1. Debug install + HUP succeeds without Shell crash
2. Agent notes post-HUP tree / no SEGV
3. Operator visual checklist checked (or soft blocker if deferred)
4. Failures filed as follow-up tasks

## Session note

**2026-08-06 Task Force A — AP5 live X11 HUP smoke**

### Ran
1. Confirmed **X11**: `XDG_SESSION_TYPE=x11`, loginctl `Type=x11`, `DISPLAY=:1`, no `WAYLAND_DISPLAY`. Branch `plan/forge-action-pipeline`.
2. `./install` from repo root → OK (`v49-90-beta.2-174-gd2aa416`, lineage `luke`, host `black`). Install-origin points at this tree.
3. Logging: `gsettings --schemadir …/schemas` → `logging-enabled=true`, `log-level=4`.
4. `killall -HUP gnome-shell` at **2026-08-06T11:55:54-04:00**. Shell + DBus ready ~4s later (pid 83969).
5. Post-HUP: `gnome-extensions info` **Enabled: Yes / State: ACTIVE**; `forge ping` `{ok:true, apiVersion:8}`; `forge tree` dumps forest.
6. Optional **dry-run only** (no apply): `forge layout dev --dry-run` → mode B thrash-recover, thrashState thrashed score=17, thrashRisk=19 (all tiles piled on mon0). Did **not** run full `forge layout dev` apply (avoid thrash; mon-order reverse is separate).
7. `npm test` → **203 files / 2219 tests passed** (~4s).

### Outcome
| Check | Result |
| --- | --- |
| Install + HUP crash? | **No** — Shell survived; no SEGV / core dump in journal since HUP |
| Extension present | **Yes** — ACTIVE, session-api exported `org.gnome.Shell.Extensions.Forge` |
| Action-pipeline load | Enable path clean: `enable` → overrides → `forge initialized` → session-api own/export |
| SEGV / GJS TypeError from forge | **None** observed |

### Journal / trace notes (not crash)
- **~4s after enable:** `[Forge] [ERROR] layout-controller: verify mismatch give-up after 10 layout retries; reasons=["post-render"] checked=7 mismatches=6` (sample rect-mismatch ids). Expected post-HUP settle noise with thrashed topology — **not** a Shell crash.
- **session-layout-trace** (`~/.config/forge/config/session-layout-trace.log`): at HUP time `restore begin` → **`no envelope (missing/invalid file)`** → soft-rehome normal settle. Prior install (11:55:37Z) had shield reapply + rehome; explicit HUP had nothing to restore.
- Tree after HUP: **mon0 HSPLIT 8 windows** (Chrome×5 + Ghostty×2 + Update-manager FLOAT); **mon1–7 empty** kids. Matches dry-run thrash diagnosis (roles-wrong-mon, tabbed not grouped).
- Benign noise: `gnome-shell-disable-extensions: File exists`; gsd-media-keys accelerator grab during shell gap; DING Gjs unix_signal warning (unrelated).

### Operator residual checklist (visual — **soft**, not agent-green)
- [ ] Click mon0 Ghostty → mon1 tabs no flash
- [ ] Tab switch → raise + strip; no ¼ height collapse
- [ ] Focus keys → borders follow; no forest reflow
- [ ] Move / swap / drag → one settle each
- [ ] Optional: `forge layout dev` apply when ready → open batch clean (mon-order reverse known separate bug — do not fail AP5 on that alone)

### Out of scope (unchanged)
- Fix mon-order reverse; push; long thrash.

### Agent acceptance
1. ✅ Debug install + HUP no Shell crash  
2. ✅ Post-HUP tree / no SEGV documented  
3. ⏳ Operator visual matrix remaining (soft)  
4. No new failure tasks filed for HUP crash; verify-mismatch + thrash topology noted only  

**No commit** (prefer until Task Force B).
