# forge (lukebmay) — active priorities

**Updated:** 2026-08-09  
**Lens:** `black` dual 4K Shell 46 — **Wayland** daily driver + nest dual-mon RC  
**Branch:** **`master`** default  
**Push:** only when human asks.

**Active:** Nest **isolation strategies** (discussion first) then practical isolation
+ extension shutdown; continue nest dual-mon RC with `_forge-test-*` only.
Architecture = cold spine + D019 hard/soft (not patch thrash).

**FIRM:** `forge nested stop` after nest tests — never leave subshells running.
See [testing.md](./testing.md) + [HANDOFF](./HANDOFF.md#nest-lifecycle--stop-after-tests-firm).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0 next** | **Discussion:** nest isolation strategies (separate user? profile? env? extension unload) | [D0 task](./tasks/forge-nested-isolation_d0-discussion.md) |
| **P0** | Nest dual-mon RC + layout smoke (`_forge-test-*`); host mon-sized dummy mons | [suite](./plans/forge-wayland-rc-test-suite.md) |
| **P0 use** | Live matrix on `_forge-test-*` only (L0 first) | [AI live matrix](./plans/forge-ai-live-test-matrix.md) |
| next | R010 only if first-shot structure still fails after place→structure | [REGRESSIONS](./REGRESSIONS.md) |
| later | STACKED / resize-autotile | separate plans — do not mix into settle spine |
| abandoned | `Ctrl+Super+Esc` unfocus (FC2) | keybind unbound |
| done | R007; D019 SE0–SE9; AT-W1; CLI jobs; leader true-cold; place→structure residual | completed/ |

**Handoff:** [HANDOFF.md](./HANDOFF.md) — spine over band-aids; headless reattach after true cold; **always stop nest**.

```bash
forge test live probe
forge test live plan --from-work open-leaf
forge nested start --monitors=2 --replace
# throwaway: eval $(forge nested env --export) && forge layout _forge-test-ghosttys
forge nested stop    # FIRM when nest work ends
forge nested status  # running: False
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft — product |
| [cold topology](./plans/forge-layout-cold-topology.md) | Spine |
| [Wayland RC suite](./plans/forge-wayland-rc-test-suite.md) | Procedure + nest dual |
| [REGRESSIONS.md](./REGRESSIONS.md) | R0xx + guards |
