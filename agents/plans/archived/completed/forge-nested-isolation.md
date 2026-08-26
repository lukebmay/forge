# forge-nested-isolation — Nest data isolation + lifecycle (D022)

**Status:** done (N3→N1→N4→N2 shipped 2026-08-10; N5 optional later)  
**Priority:** was **P0** — isolation v1 complete; resume Wayland RC under locked process  
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

| Id | Task | Why this order | Status |
| --- | --- | --- | --- |
| **N3** | Auto stop + cleanup | Operator safety; small; unblocks any nest use without residual mess | done |
| **N1** | Nest `FORGE_HOST` + CLI config/state roots | Stops CLI mutators rewriting parent heuristics/windows.json | done |
| **N4** | Docs / agent rules | Encode D022 + shipped APIs (`run`, env) | done |
| **N2** | Extension/Shell data root | Nest JS must not write parent `~/.config/forge` | done |
| **N5** | Optional chrome-in-nest | Only after N1–N2 proven | later |

**Shipped process (agents):** prefer `forge nested run -- …` for campaigns; mon=1
default; multi-mon only for multi-mon cases; nest only for code→reload.
CLI + nest Shell: `FORGE_HOST` + `FORGE_CONFIG_HOME` (N1/N2). Extension honors
`FORGE_CONFIG_HOME` via `forgeConfigHome()`.

Full anti-taint v1 landed. Resume [Wayland RC suite](./forge-wayland-rc-test-suite.md)
with nest used correctly (mon=1 unless multi-mon case).

## Acceptance (plan)

- [x] N3: nest campaign helpers always leave `running: False`; stale reaper works
- [x] N1: nest `forge layout` / settle writes under nest data root; parent heuristics unchanged
      (CLI: `FORGE_HOST` + `FORGE_CONFIG_HOME`)
- [x] N4: testing.md + HANDOFF + RC suite match D022 (mon count, when-to-nest, `run`)
- [x] N2: nest-loaded extension does not mutate parent `~/.config/forge`
      (`forgeConfigHome` + `shell_start_env`; live parent mtime OK)
- [x] Units for pure path/env helpers; live smoke start→exec→exit→status False
  (N3: `run` + reaper; N1: client_env; N2: conf root + shell env)

## Code map

| Piece | Path |
| --- | --- |
| Nest harness | `scripts/forge/nested_wayland.py` |
| Heuristics host | `settle_heuristics.py` (`FORGE_HOST`) |
| Layout host | `layout_lib.py` (`FORGE_HOST`) |
| Config paths | CLI config_dir helpers; extension `forgeConfigHome()` / confDir (`FORGE_CONFIG_HOME`) |
| Live probe | `live_matrix.py` / `forge test live probe` |

## Related

- RC procedure: [forge-wayland-rc-test-suite.md](./forge-wayland-rc-test-suite.md)
- Testing FIRM: [testing.md](../testing.md) § Wayland
- Completed tasks: [completed/](./completed/)
