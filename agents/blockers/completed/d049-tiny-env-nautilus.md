# B-d049-tiny-env — Host tiny-env Nautilus prove (D049)

**Status:** open
**Severity:** soft
**Owner:** human
**Kind:** verify
**Plan:** forge-min-size-floor (D049 M5)
**Unblocks:** full plan acceptance (eyes-on); agents/plans/forge-min-size-floor.md
**Priority:** P1
**Created:** 2026-08-19
**Updated:** 2026-08-19

## Why this is human-only
Tiny env must reach **gnome-shell** (session env), then eyes-on: Nautilus clamp-learn, red zones, BFS/float, no probe journal. Agent L0 + nest already PASS.

## Agent prep already done
- M1–M4 code/docs on `master` (uncommitted until you ask)
- L0 **135** (min-tile + drop + open-min + open-app + drag-drop + overflow-rehome)
- `./install --kit=vim` tip installed (Wayland tip deferred → **logout once**)
- Nest mon=1: `forge ping` + `layout _forge-test-clean` **ok**; `running: False`
- `rg 'ensureWindowMinSizeKnown|minProbe|_forgeMinProb' docs/ lib/` empty

## What the human must do
1. **Logout once** (load dirty tip into host Shell).
2. Put tiny floor in the **session** env that gnome-shell sees, e.g. user systemd env or login session:
   - `FORGE_MIN_TILE_WIDTH=1`
   - `FORGE_MIN_TILE_HEIGHT=1`
   Then start a new session so Shell inherits them.
3. Open **Nautilus** onto a **short** pane (split that would undersize).
4. Confirm:
   - Passive learn raises class floor (`~/.config/forge/config/window-mins.json` updates; no forever shrink)
   - DnD red zones use learned/floor mins
   - Overflow BFS → tab or float; vacated gap gone
   - Journal: **zero** `minProbe` / `_forgeMinProbing` / `ensureWindowMinSizeKnown`

```bash
# After logout + tiny session env:
journalctl --user -b --no-pager | rg 'minProbe|_forgeMinProb|ensureWindowMinSizeKnown|overflowRehome|overflow-tab|overflow-float' | tail -40
# optional:
cat ~/.config/forge/config/window-mins.json
```

## Done when
Human confirms the four bullets above (or notes a real fail with journal snippet). Close this blocker; mark D049 M5 / plan acceptance complete.
