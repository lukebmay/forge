# forge-ws-super2-bounce — Super+2 fakout (WS2 flash → back to WS1)

**Status:** in progress — **external cause proven**; forge pin-restore is not the driver
**Plan:** (none)
**Branch:** master
**Blocker:** soft human — Guake-off (or Guake `window-refocus=false`) confirm; optional mutter focus watch
**Updated:** 2026-08-24

## Goal

Stop Super+2 (after `layout:dev` settle) from briefly showing WS2 then bouncing
back to WS1, which also steals focus off the carefully focused left Ghostty.

## Acceptance

- [x] plog / host evidence that bounce is **not** forge `activate_workspace` /
  pin-restore driving the WS switch
- [ ] Identify external actor (Guake settings highly likely) + confirm with
      Guake killed **or** `window-refocus` off
- [ ] If any forge residual remains (pointer steal / pin noise after Meta bounce),
      fix that class without “bounce-prevention” fallbacks on the WS path
- [ ] Host: settle after `layout:dev` → Super+2 lands on WS2 and stays

## Critical host finding (2026-08-24)

Operator: `./install --dev` → logout/in → `forge layout:dev` →
`gnome-extensions disable forge@…` → wait 5–10s → **Super+2 still snapbacks**.

**Conclusion:** the workspace bounce is **outside Forge**. Forge does not own
`switch-to-workspace-N` (still GNOME `['<Super>2']`). Pin-restore /
`ws-change preserve` only run while enabled and do not call
`activate_workspace` (raise + LTF only).

### Journal / env around the repro (session `A1w2k` enable at 14:08:20)

| Time (local) | Event |
| --- | --- |
| `14:07:40` | Guake autostart |
| `14:07:43` | `guake-toggle` via `gsd-media-keys` |
| `14:07:47` | Guake `Hiding on focus lose` |
| `14:07:59` | forge **disable** |
| ~disable→enable | Super+2 bounce observed **with forge off** |
| `14:08:20` | forge **enable** (hunt tape truncated — prior bounce lines gone) |

### Guake settings that can bounce focus/WS (prime suspect)

```text
window-ontop true
window-refocus true
window-losefocus true
focus-if-open true
lazy-losefocus true
```

Guake is already float-exempt (`windows.json` class `Guake`). It does not need
to be tiled to steal focus on Wayland.

### Earlier session `G2DXn` (forge **enabled**)

After soft settle: `?→1` then `1→0`; `afterFocus pin-restore` on the return
leg; later Guake on `mo0ws1` stole pointer. That pin-restore line is
**correlated with Meta focus**, not proof forge switched the workspace.

## Soft ask (human) — tightened

1. `pkill -f guake` **or** `dconf write /apps/guake/general/window-refocus false`
   (and ideally `window-ontop false` for a second trial).
2. With forge **enabled**, settle `layout:dev`, then Super+2 once.
3. Report: bounce gone / still present. If still present with Guake dead, next
   suspects: sticky/urgency window on WS0, just-perfection, Mutter focus policy
   (`focus-mode=click`, `focus-change-on-pointer-rest=true`).

**Note:** enable truncates plog tapes. Capture hunts **before** disable/enable
cycles, or accept that disabled-bounce has **no** forge TRACE (by design).

## Architecture (do not “patch” the bounce in forge)

| Wrong fix | Why |
| --- | --- |
| More pin / ws-change preserve / soft timers on Super+N | Treats Meta fallout as forge WS ownership |
| Forge override of `switch-to-workspace-N` | Not product; hides external actors |
| Guake special-case in pin-restore | App-specific band-aid; Guake already float |

| Right direction | Why |
| --- | --- |
| Prove external (Guake refocus/ontop) and document / optional ops note | Matches disabled-forge repro |
| Only fix forge if a **remaining** class is forge-owned (pointer handoff after Meta bounce) | Named focus API, not WS activate |

## Related finding (separate issue — enable thrash)

Same repro: re-enable left Ghostty at **~⅓ width** (live tree
`pct=0.333…`, painted `w=836` of `2510`; mon0 sibling `pct` sum **0.833**).

Root class: **DING `gjs` “Desktop Icons” admitted as TILE**, carved into
session-layout, then stripped by `cleanTree()` (`wmClass === "gjs"`) without
leaving healthy `userSized` shares. See HANDOFF / follow-up task notes — **do
not** “fix” Super+2 by papering enable restore.

## Hunt (forge enabled only)

```bash
forge log --grep 'active-workspace-changed|Guake|pin-restore|moved pointer' --level trace --since 10m
```
