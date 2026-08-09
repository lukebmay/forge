# forge (lukebmay) — active priorities

**Updated:** 2026-08-09  
**Lens:** `black` dual 4K Shell 46 — **X11 preferred for agent live test**; Wayland daily driver too  
**Branch:** **`master`** default (side branches only for major refactors/features)  
**Push:** only when human asks.

**Active:** Settle-contract **SE0–SE10 shipped**. Nested Wayland harness **AT-W1 shipped**. Next: human CT2 (optional nest) / shellrc durable Grok.

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| done | [CLI attachable jobs](./plans/forge-cli-jobs.md) | **Shipped** CJ1–CJ6 (D021) |
| **P0 use** | [AI live test matrix](./plans/forge-ai-live-test-matrix.md) | **AT0–AT2 + FC3 cases** — layout/focus sign-off |
| done | [AT-W1 nested Wayland](./plans/forge-ai-live-test-matrix.md) | **Shipped** `forge nested`; dual-mon CT still human |
| later (shellrc **P0**) | Durable Grok (GH0 leader spike first) | **shellrc** — not forge: `…/grok-reattachable-headless_gh0-leader-spike.md` |
| human | CT2 Wayland cold smoke | logout and/or `forge nested` |
| done | SE9 reset-heuristics + schema invalidate; SE6/SE10; FC3; AT2; CJ1–CJ6; SE0–SE8b; R007 | completed/ |

**Handoff doctrine:** [HANDOFF.md](./HANDOFF.md) — spine over band-aids; no personal-layout code.

**Live tests:** select by work — never default-run the full matrix.

```bash
forge test live probe
forge test live plan --from-work open-leaf   # or cold|clean|settle|focus|close|unfocus
forge test live run --tags R008              # after open-leaf work
forge test live run --from-work close        # FC3 close-focus
forge test live run --from-work unfocus      # FC3 unfocus
```

| Doc | Role |
| --- | --- |
| [HANDOFF.md](./HANDOFF.md) | Start here |
| [AI live matrix](./plans/forge-ai-live-test-matrix.md) | Capability + selective suites |
| [CLI jobs plan](./plans/forge-cli-jobs.md) | Durable mutators (shipped) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft settle |
| [focus close + escape](./plans/forge-focus-close-and-escape.md) | Close focus + unfocus (FC0–FC3 done) |
| [REGRESSIONS.md](./REGRESSIONS.md) | Guard spine + live case tags |
