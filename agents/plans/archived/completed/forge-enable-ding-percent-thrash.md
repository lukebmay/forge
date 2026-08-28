<!-- migrated from agents/tasks/forge-enable-ding-percent-thrash.md by agents migrate-layout -->

# forge-enable-ding-percent-thrash — re-enable Ghostty ~⅓ width

**Status:** agent done — host verify after `./install --dev` (+ logout or disable/enable)
**Plan:** (none)
**Branch:** master
**Blocker:** soft human — disable→enable after `layout:dev`; confirm Ghostty ~½
**Updated:** 2026-08-24

## Goal

After `layout:dev` → disable → enable, left Ghostty must keep the saved ~½
share (tab CON | Ghostty), not collapse to ~⅓ with mon-child percents summing
&lt; 1.

## Acceptance

- [x] DING / desktop-icon surfaces never enter the TILE forest (admit-time
      ignore) — not only a post-hoc `cleanTree` wipe
- [x] Session portable save/restore drops DING and renormalizes sibling shares
- [x] Monitor `removeNode` scales remaining shares (no `resetSiblingPercent` wipe)
- [x] L0: float-reason + ignore-mode + session-layout + Tree-cleanup
- [ ] Host: `layout:dev` → disable → enable → `forge tree` Ghostty ~0.5 / ~½ width

## Fix landed

| Piece | Where |
| --- | --- |
| `isDingDesktopIconsSurface` | `lib/shared/float-reason.js` |
| Product ignore at track | `WindowManager.isWindowIgnored` |
| `cleanTree` narrowed to DING (not all `gjs`) | `tree.js` |
| Monitor remove scales shares | `tree.js` `removeNode` → `renormalizeChildPercents` |
| Portable/live skip + renormalize | `session-layout.js` |
| Bundled ignore rule | `config/windows.json` |

## Host verify

```bash
cd ~/dev/me/forge && ./install --dev   # then logout/in or disable→enable
forge layout:dev
# settle, then:
gnome-extensions disable forge@jmmaranan.com
sleep 2
gnome-extensions enable forge@jmmaranan.com
forge tree   # mon0 Ghostty percent ~0.5, childPctSum ~1
```
