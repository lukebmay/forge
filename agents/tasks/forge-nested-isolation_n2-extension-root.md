# forge-nested-isolation_n2-extension-root — Nest Shell / extension data root

**Status:** ready  
**Plan:** [forge-nested-isolation](../plans/forge-nested-isolation.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends on:** N1 (CLI contract for data root)

## Goal

Nested gnome-shell + Forge extension must **not** mutate parent
`~/.config/forge` (windows.json, settle-heuristics seed, styles, profiles).

## Acceptance

- [ ] Nest shell start env sets user config/data isolation consistent with N1
      (e.g. `XDG_CONFIG_HOME` under nest state, or forge-specific override
      read by extension)
- [ ] Extension confDir / settle seed reads nest root when isolated
- [ ] Live: nest layout or settings write leaves parent `~/.config/forge`
      unchanged (compare or host-key isolation)
- [ ] Host extension after nest stop still uses parent paths unchanged
- [ ] Units where pure; document remaining shared surface (install UUID on disk)

## Context for the next agent

- Extension uses `GLib.get_user_config_dir()` / ConfigManager confDir in
  `lib/shared/settings.js` etc.
- Shared disk install path for extension JS is **intentional** (retest tip)
- Harder than N1 — do not half-ship XDG that breaks nest Shell settings
  discovery; prefer minimal forge-specific override if full XDG is too wide

## Session note

Created 2026-08-10 after D022; implement after N1.
