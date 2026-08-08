# Handoff — forge (lukebmay)

**Updated:** 2026-08-08 (CT0 approved + pushed; next = CT1 implement)  
**Branch:** `plan/forge-layout-cold-topology` (from current `master`)  
**Sessions:** **Wayland and X11 are both daily drivers** (X11 on older machines)

---

## Start here

| Pri | Work | Path |
| --- | --- | --- |
| **P0** | **CT1** skeleton-first implement (code A/B) | [CT1](./tasks/forge-layout-cold-topology_ct1-skeleton.md) · [plan § CT0 lock](./plans/forge-layout-cold-topology.md) |
| → | CT2 Wayland live · CT3 X11 live | [CT2](./tasks/forge-layout-cold-topology_ct2-wayland-live.md) · [CT3](./tasks/forge-layout-cold-topology_ct3-x11-live.md) |
| post | Cleanup dead cold fallbacks (after live green) | [cleanup](./tasks/forge-layout-cold-topology_cleanup-fallbacks.md) |
| shellrc | gdisplays session/greeter (GS0+) | `~/dev/me/shellrc/agents/plans/gdisplays-session-greeter.md` |

---

## Architecture lock (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Settle thrash (AC1–AC6) | Done — residual geom = echo |
| Cold Mode B second pass | **Not** the product fix — skeleton-first one-shot |
| Thrash mid-batch | Forbidden while layout ops in flight |
| Tree shape vs bind | Shape first; async bind to slots OK |
| Skeleton mechanism | Slot-tagged AC4 placeholders (CT0 approved) |
| X11 | Daily driver parity (CT3), not optional |
| Cleanup | After CT2/CT3: remove cold fallbacks that architecture makes dead |

---

## CT1 implement (next agent)

1. On branch `plan/forge-layout-cold-topology` (merge latest `master` first).  
2. Read plan § **CT0 design lock** — phases P0–P6, file list, non-Mode-B cold path.  
3. A/B taskforces for **code** (not live testing). Unit fixtures prove phase order.  
4. Stop at CT2/CT3 when live operator tests required.  
5. Do **not** start cleanup-fallbacks until CT2+CT3 green.

**Key paths:** `layout_plan.py`, `layout_apply.py`, `scripts/forge/forge`
`_layout_run_reconcile`, `run-steps.js`, `session-api.js`,
`layout-placeholder.js` / `tree.js`, unit CLI fixtures under
`tests/unit/cli/fixtures/layout/`.

---

## Operator after login

1. `gdisplays --status` — if scale wrong: `gdisplays load default`  
2. Greeter wrong: `gdisplays --user-to-login` until GS2 write-through ships  
3. Agent: **CT1** implement (forge)

---

## Open human blockers

- hard: resize-autotile-design (P3 — unrelated to cold layout)

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
