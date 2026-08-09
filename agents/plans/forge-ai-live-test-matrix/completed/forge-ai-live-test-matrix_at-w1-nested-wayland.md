# forge-ai-live-test-matrix_at-w1-nested-wayland — Nested Wayland retest harness

**Status:** done  
**Plan:** forge-ai-live-test-matrix  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Run nested GNOME Shell (Wayland) so extension reloads do not require logging out of
the host Wayland session. Independent of shellrc; forge must not depend on shellrc.

## Acceptance

- [x] Durable private D-Bus + `gnome-shell --nested --wayland`
- [x] `forge nested start|stop|restart|status|env|exec|enable-forge|logs|wait`
- [x] Client env points forge/apps at nest (`eval $(forge nested env --export)`)
- [x] Live: start → Forge ready → `forge ping` ok → restart → stop
- [x] Units for pure helpers
- [x] Makefile targets (`nested-start` etc.)
- [x] shellrc twin `nested-gnome` (generic; no forge dependency)
- [x] Host WAYLAND_DISPLAY detection ignores nest displays after env export

## Context for the next agent

- **Code:** `scripts/forge/nested_wayland.py`; CLI wired in `scripts/forge/forge`
- **State:** `~/.local/state/forge/nested/<name>/` or `$FORGE_NESTED_ROOT`
- **Host override:** `HOST_WAYLAND_DISPLAY` / `FORGE_NESTED_HOST_WAYLAND`
- **shellrc:** `scripts/devices/displays/nested-gnome.zsh` → `bin/nested-gnome`
- **Not done:** wire `forge test live` capability for nest; dual-mon CT2 still human
- **Note:** `gnome-extensions enable` often times out on nest; gsettings + Shell.Eval
  path is enough (`forge_ready` still True). User dconf may already list Forge.

## Session note

2026-08-09: AT-W1 harness shipped and live-smoked on host Wayland (GNOME 46).
Ping returned ok against nested Forge. Size flag parse fixed (was REMAINDER).
