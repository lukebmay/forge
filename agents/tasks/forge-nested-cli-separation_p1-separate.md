# forge-nested-cli-separation_p1-separate — Separate Nested from user CLI

**Status:** next  
**Plan:** [forge-nested-cli-separation](../plans/forge-nested-cli-separation.md)  
**Branch:** master  
**Blocker:** (none) — **gate:** complete P0 plan lock first  
**Depends-on:** [forge-nested-cli-separation_p0-plan](./forge-nested-cli-separation_p0-plan.md)  
**Updated:** 2026-08-17

## Goal

Implement the locked P0 design: Nested is **not** part of the everyday user Forge
CLI surface; it is available only via the **testing-tools** entry point. Update
code, help, docs, Makefile, live matrix, and agent FIRM strings in one coherent
slice (or P1 code + P2 docs if the plan split them — default is one slice).

## Acceptance

Refine after P0; baseline:

- [ ] P0 decisions recorded on the plan before code lands
- [ ] Top-level user `forge help` / command list does **not** advertise Nested
- [ ] Top-level `forge nested` matches P0 compat (absent or shim only if locked)
- [ ] Nested lifecycle still works via the locked testing entry (start/run/stop/status/env/doctor as applicable)
- [ ] `live_matrix` / `forge test live` probe text and any nest orchestration use the new entry
- [ ] Makefile nest targets use the new entry
- [ ] User docs do not recommend Nested for daily-driver reload
- [ ] CONTRIBUTING + `agents/testing.md` + HANDOFF/PRIORITY FIRM strings updated
- [ ] Units updated; help-surface assert if present
- [ ] Dev smoke: campaign entry leaves `running: False` (same D022 rule)
- [ ] No change to nest isolation semantics (FORGE_HOST / FORGE_CONFIG_HOME) unless required for the new entry

## Context for the next agent (complete + succinct)

### Gate

Do **not** start implementation until
[P0](./forge-nested-cli-separation_p0-plan.md) has locked entry point, ship rule,
and compat on
[the plan](../plans/forge-nested-cli-separation.md).

### Likely touch list (confirm from P0 inventory)

- `scripts/forge/forge` — drop or relocate nested subparser; hoist helper
- `scripts/forge/cli_help.py` — remove Nested from user Commands
- `scripts/forge/nested_wayland.py` — entry messages / argv brand only if needed
- `scripts/forge/live_matrix.py` — capability notes / strings
- `Makefile` — nested-* targets
- `docs/user/troubleshooting.md` — user Wayland reload without Nested product pitch
- CONTRIBUTING, `agents/testing.md`, HANDOFF, PRIORITY, project nest mentions
- `tests/unit/cli/test_nested_wayland.py` (+ help tests if any)
- Install/migrate warn strings that advertise `forge nested` (`_lib.zsh`, etc.)

### Do not

- Redesign D022 isolation or mon defaults
- Port nest to Node (CN14)
- Leave agent docs teaching `forge nested` if that verb is removed
- Leave a nest running after verification (`run` preferred; else `stop`)

### Prove

```bash
# After P0 locks the real commands, replace ENTRY accordingly:
# ENTRY='forge test nested'   # example only — use locked string
python3 -m pytest tests/unit/cli/test_nested_wayland.py -q
# help must not list top-level nested for users (exact assert from P0)
forge help | rg -i nested   # expect empty on user help, or only test grouping per P0
# Dev campaign (host Wayland):
# $ENTRY run -- forge ping
# $ENTRY status   # running: False
```

## Session note

**2026-08-17:** Task stubbed as **next**. Waiting on P0 lock. No code yet.
