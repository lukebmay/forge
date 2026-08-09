# forge (lukebmay) — active priorities

**Updated:** 2026-08-09  
**Lens:** `black` dual 4K Shell 46 — **X11 preferred for agent live test**; Wayland daily driver too  
**Branch:** **`master`** default (side branches only for major refactors/features)  
**Push:** only when human asks.

**Active:** AI live matrix first → then SE8b / CE1 / focus-close. Wayland nested later.

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P0** | [AI live test matrix](./plans/forge-ai-live-test-matrix.md) | **AT0/AT1 shipped** — use `forge test live`; AT2 polish ready |
| high | [SE8b true cold open leaf](./tasks/forge-layout-settle-contract_se8-true-cold-open-leaf.md) | ready — run `forge test live run --tags R008` |
| high | [CE1 layout clean empty tiles](./tasks/forge-layout-clean-empty_ce1-detect.md) | ready — run `--from-work clean` after fix |
| high | [Focus close + Esc](./plans/forge-focus-close-and-escape.md) | FC0 ready |
| mid | [AT2 L1 setup precision](./tasks/forge-ai-live-test-matrix_at2-l1-setup.md) | ready |
| later | [AT-W1 nested Wayland](./plans/forge-ai-live-test-matrix.md) | optional — only before Wayland CT |
| mid | Merge DnD plan branch | complete — merge when ready |
| optional | settle SE6 geom soft | optional |
| human | CT2 Wayland cold smoke | logout when needed |
| done | settle SE0–SE5+SE7; R007 partial | completed/ |

**Handoff doctrine:** [HANDOFF.md](./HANDOFF.md) — spine over band-aids; no personal-layout code.

**Live tests:** select by work — never default-run the full matrix.

```bash
forge test live probe
forge test live plan --from-work open-leaf   # or cold|clean|settle|focus
forge test live run --tags R008              # after open-leaf work
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [AI live matrix](./plans/forge-ai-live-test-matrix.md) | Capability + selective suites |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft settle |
| [focus close + escape](./plans/forge-focus-close-and-escape.md) | Close focus + unfocus |
| [REGRESSIONS.md](./REGRESSIONS.md) | Guard spine + live case tags |
