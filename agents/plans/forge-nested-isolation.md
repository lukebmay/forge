# forge-nested-isolation — Nest data isolation + lifecycle (D022)

**Status:** active — design locked; implement N3 → N1 → N4 → N2  
**Priority:** **P0** (before nest-heavy RC campaigns)  
**Decision:** [D022](../../docs/DECISIONS.md) · design lock
[D0 discussion](../tasks/completed/forge-nested-isolation_d0-discussion.md)  
**Branch:** master  

## Goal

Make nested Wayland retest **safe and cheap**:

1. Do not taint parent forge config / heuristics.
2. Always clean up nest (no residual bus/shell for operator).
3. Nest only when a code→reload loop needs it; default **1 mon**.
4. Multi-mon nest only when testing multi-mon behavior.

## Non-goals (v1)

- Separate UNIX test user (escalate only if data-root isolation fails).
- Full chrome L1 inside nest (host remains chrome RC authority until N5).
- bubblewrap / full sandbox.

## Implement order (value first)

| Id | Task | Why this order |
| --- | --- | --- |
| **N3** | Auto stop + cleanup | Operator safety; small; unblocks any nest use without residual mess |
| **N1** | Nest `FORGE_HOST` + CLI config/state roots | Stops CLI mutators rewriting parent heuristics/windows.json |
| **N4** | Docs / agent rules | Encode D022 so agents default mon=1, nest-only-for-reload |
| **N2** | Extension/Shell data root | Nest JS must not write parent `~/.config/forge` |
| **N5** | Optional chrome-in-nest | Only after N1–N2 proven |

After N3+N1+N4: safe structure retest loop.  
After N2: full anti-taint.  
Then resume [Wayland RC suite](./forge-wayland-rc-test-suite.md) with nest used correctly.

## Acceptance (plan)

- [ ] N3: nest campaign helpers always leave `running: False`; stale reaper works
- [ ] N1: nest `forge layout` / settle writes under nest data root; parent heuristics unchanged
- [ ] N4: testing.md + HANDOFF + RC suite match D022 (mon count, when-to-nest)
- [ ] N2: nest-loaded extension does not mutate parent `~/.config/forge`
- [ ] Units for pure path/env helpers; live smoke start→exec→exit→status False

## Code map

| Piece | Path |
| --- | --- |
| Nest harness | `scripts/forge/nested_wayland.py` |
| Heuristics host | `settle_heuristics.py` (`FORGE_HOST`) |
| Layout host | `layout_lib.py` (`FORGE_HOST`) |
| Config paths | CLI config_dir helpers; extension `GLib.get_user_config_dir()` / confDir |
| Live probe | `live_matrix.py` / `forge test live probe` |

## Related

- RC procedure: [forge-wayland-rc-test-suite.md](./forge-wayland-rc-test-suite.md)
- Testing FIRM: [testing.md](../testing.md) § Wayland
