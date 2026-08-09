# forge (lukebmay) — active priorities

**Updated:** 2026-08-09  
**Lens:** `black` dual 4K Shell 46 — **X11 preferred for agent live test**; Wayland daily driver too  
**Branch:** **`master`** default (side branches only for major refactors/features)  
**Push:** only when human asks.

**Active:** CLI jobs **shipped**. Next mid queue (AT2 / FC3 / DnD merge / …).

---

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| done | [CLI attachable jobs](./plans/forge-cli-jobs.md) | **Shipped** CJ1–CJ6 (D021) |
| **P0 use** | [AI live test matrix](./plans/forge-ai-live-test-matrix.md) | **AT0/AT1 shipped** — use for layout sign-off |
| mid | [AT2 L1 setup precision](./tasks/forge-ai-live-test-matrix_at2-l1-setup.md) | ready (Guake-hidden probe polish useful) |
| mid | [Focus close + Esc](./plans/forge-focus-close-and-escape.md) FC3 | draft combined live smoke |
| later | [AT-W1 nested Wayland](./plans/forge-ai-live-test-matrix.md) | optional — only before Wayland CT |
| later (shellrc **P0**) | Durable Grok (GH0 leader spike first) | **shellrc** — not forge: `…/grok-reattachable-headless_gh0-leader-spike.md` |
| mid | Merge DnD plan branch | complete — merge when ready |
| optional | settle SE6 geom soft | optional |
| human | CT2 Wayland cold smoke | logout when needed |
| done | CJ1–CJ6 jobs; FC2 unfocus; FC0–FC1; SE8b R008; CE1 R009; SE0–SE5+SE7; R007 | completed/ |

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
| [CLI jobs plan](./plans/forge-cli-jobs.md) | Durable mutators (shipped) |
| [settle contract](./plans/forge-layout-settle-contract.md) | Hard/soft settle |
| [focus close + escape](./plans/forge-focus-close-and-escape.md) | Close focus + unfocus |
| [REGRESSIONS.md](./REGRESSIONS.md) | Guard spine + live case tags |
