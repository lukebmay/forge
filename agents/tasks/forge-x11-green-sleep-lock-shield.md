# forge-x11-green-sleep-lock-shield — X11 green sleep / lock-shield race

**Status:** next
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-23

## Goal

Diagnose the recurring sleep/wake issue on host `green` (X11 + NVIDIA), keep tip
installed `--dev` with TRACE, and fix the lock-shield hole that leaves overnight
DPMS uncovered after enable/HUP while already locked.

## Acceptance

- [x] green forge tip up to date + `./install --dev`
- [x] `forge log trace --persist` enabled
- [x] Repro soft blank / lock+DPMS / wake with `session-sleep`; layout stays TILE
- [x] Root-cause notes for NVIDIA HDMI hotplug vs soft DPMS
- [x] Fix: restore-while-locked arms `fromLock` shield (not 3s post-HUP)
- [x] L0: H1 lock-shield contract + restore-while-locked tests green
- [ ] Optional: human overnight eyes-on after tip (HDMI panel power-off path)

## Context for the next agent (complete + succinct)

### Host

- `green`: GNOME 46, **X11**, single HDMI ASUS VE276, **NVIDIA GTX 1650**
- Display is `:1` (not `:0`); export gnome-shell environ for remote tools
- Helpers: shellrc `session-sleep` (`blank` / `dpms` / `lock` / `wake` / `status`)

### What we saw

1. Soft software DPMS (`session-sleep blank|dpms`) keeps Mutter HDMI connected;
   forge log quiet; tree stays TILE. Soft path is healthy on tip.
2. Overnight / long idle: ASUS panel powers the link → NVIDIA logs HDMI
   connected/disconnected storms; sometimes full gdm re-login (2026-08-22
   21:02 shell restart loop). That is the hard path — not reproducible with
   short `xset dpms force off`.
3. **Bug:** enable/HUP while already in `unlock-dialog` calls `onSessionLocked`
   before track/restore → `lock shield empty`. Restore then installed a **3s**
   shield **without** `fromLock`. After 3s while still locked,
   `sessionLayoutShieldActive()` went false → overnight DPMS thrash had no
   lock forest. Trace hit today at install-while-locked:
   `2026-08-23T15:45:01Z lock shield empty`.

### Fix (uncommitted on master + dirty on green)

- `LOCK_SHIELD_WHILE_LOCKED_US` in `monitor-recovery.js`
- `restoreSessionLayoutAfterTrack`: if `_sessionLocked`, arm `fromLock` + long
  TTL using restored forest/focus (not 3s post-HUP)
- L0 in `bug-h1-monitor-recovery-workareas-thrash.test.js` (22 pass)

### Enable / test

```sh
ssh green  # then use gnome-shell environ DISPLAY=:1
cd ~/dev/me/forge && ./install --dev
forge log trace --persist
session-sleep status
session-sleep blank --delay=3s wake --force
session-sleep lock --delay=2s dpms --force
session-sleep wake --force   # unlock may need loginctl / password
tail -f ~/.local/state/forge/forge.log
# file trace: ~/.config/forge/config/session-layout-trace.log
```

### Risks

- Hard HDMI hotplug after panel firmware sleep still needs human overnight
  eyes-on; soft DPMS does not exercise it.
- green clone may be `*-dirty` until this fix is committed and pulled.

## Session note

2026-08-23: SSH green (explicit). Pulled tip `2ad3bd0`, `./install --dev`,
TRACE persist. Soft sleep matrix PASS. Found restore-while-locked shield race;
fixed + L0. Deployed dirty tip to green and re-armed lock shield successfully.
