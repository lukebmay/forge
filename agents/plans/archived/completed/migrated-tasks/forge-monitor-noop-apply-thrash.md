# forge-monitor-noop-apply-thrash — No-op monitor re-apply must not thrash tiles

**Status:** completed (L0 + graduated settle shipped; live ApplyMonitorsConfig inject residual optional)  
**Plan:** (none) — regression class R016; related recovery: H1 / monitor-recovery  
**Branch:** master (default)  
**Blocker:** (none)  
**Priority:** P1 (daily driver; dual-mon + gdisplays)  
**Updated:** 2026-08-11  
**Regression id:** **R016** (see [REGRESSIONS.md](../../REGRESSIONS.md))

---

## Product locks (2026-08-11)

| Case | Policy |
| --- | --- |
| **L0 same geometry** | Fingerprint match → **no** thrash-pending, **no** H1 rehome/rebuild. Optional quiet render only if needed. |
| **L1 same mon set, sizes/pos/scale change** | Structure-preserving **retile** only (`renderTree` / workarea recompute). No Meta rehome storm; no T6 rebuild unless chaos. |
| **Mon loss** | Collect apps from missing mon to **end of survivor mon tree as a group** (wrap multi-unit in CON as needed). **Do not** infer HSPLIT vs VSPLIT from relative mon positions. Collect target: primary if present else lowest-index survivor. |
| **Mon gain** | New mon root **empty** — do not rebalance / steal. |
| **L4 chaos** | Lock/DPMS/unlock boost / Meta pile / mon 0 flicker → keep existing **H1**. |
| **Cross-mon tabs** | Out of scope here — [forge-tab-groups-cross-mon_d0-discussion](../forge-tab-groups-cross-mon_d0-discussion.md). |

Compose with H1/T6/T7 — do **not** invent a third recovery system. Pure classify + thin execute.

---

## Goal

When Mutter re-applies a **geometry-identical** monitor config (same connectors, modes, scale, positions, primary), Forge must **not** thrash tiled windows. Prefer quiet no-op or a **structure-preserving retile** (recompute frames only). Do not enter the full workareas thrash / monitor-recovery rebuild path for no-op layout signals. Real mon loss must **collect-to-end-as-group**, not thrash-rebuild.

Ship **unit + live** guards so this class cannot regress.

---

## Acceptance

### L0 (unit / pure)

- [x] Pure helper: workareas-changed + **identical** mon geometry fingerprint → **no** thrash-pending / **no** monitor-recovery rehome call.
- [x] Contrasting case: geometry **changes** or homes bad (Meta pile) → thrash/recovery path still armed.
- [x] Guard: `bug-r016-noop-workareas-no-thrash` + `workareas-policy.test.js`
- [x] L0 green: policy + r016 + H1 + bug-078

### L1 (live — host or nest)

- [x] Live case `L1.r016-noop-workareas` tagged **`R016`**
- [x] Automated ApplyMonitorsConfig inject deferred (stub `r016-noop-workareas-note` + manual gdisplays)
- [x] `forge test live plan --tags R016` documents the case

### Docs / queue

- [x] REGRESSIONS **R016** row updated (fix + guards)
- [x] DESIGN H1 section: no-op fingerprint + mon-loss collect-to-end
- [x] Task → `agents/tasks/completed/`

---

## Session note (2026-08-11 implement)

### What changed

| Path | Role |
| --- | --- |
| `lib/extension/workareas-policy.js` | Pure fingerprint, classify, homes samples, survivor pick, dead indices |
| `lib/extension/monitor-recovery.js` | Signal no-op short-circuit; settle graduated (noop/retile/mon_gain/mon_loss/H1); quiet fp on snapshot |
| `lib/extension/window.js` | `wm._lastQuietWorkareasFp` init |
| `tests/unit/extension/workareas-policy.test.js` | Classify matrix |
| `tests/regression/bug-r016-noop-workareas-no-thrash.test.js` | Noop + pile contrast + mon_loss collect |
| `scripts/forge/live_matrix.py` + `forge` CLI | `L1.r016-noop-workareas` + action stub |
| `docs/DESIGN.md`, `agents/REGRESSIONS.md` | Product docs |

### How to test

```bash
npm test -- tests/unit/extension/workareas-policy.test.js \
  tests/regression/bug-r016-noop-workareas-no-thrash.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js \
  tests/regression/bug-078-display-disconnect.test.js
python3 -m pytest tests/unit/cli/test_live_matrix.py -q -k r016
forge test live plan --tags R016
# After ./install + dual desk (optional live):
# forge nested run --monitors=2 -- forge test live run --tags R016
# Manual: gdisplays load when already correct → desk must not thrash
```

### Residual risks

- Live **inject** of identical ApplyMonitorsConfig not automated (action stub only) — host smoke: `gdisplays load` when already correct.
- Mon-loss collect: mon-scoped children + CON wrap (`St.Bin`); cross-mon tabs → D0 task.
- Renumber classified → still H1 (safe; not structure-preserving remap-only).
- Quiet fp uses live identity map / geom when connectors unavailable in fixtures.

### Orchestrator follow-up

- Fixed mon-loss CON `nodeValue` to `St.Bin` (string would break decoration).
- Cross-mon tabs design: [forge-tab-groups-cross-mon_d0-discussion](../forge-tab-groups-cross-mon_d0-discussion.md).

### Prior context

- shellrc gdisplays 6.4.2 skips no-op apply; Forge still owns signal resilience.
- Do not merge gdisplays into forge.
