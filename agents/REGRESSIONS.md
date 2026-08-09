# Layout / open-app regressions

**Purpose:** stop re-fixing the same dual-mon bugs without a durable record.
When a live failure repeats a known class, **add a unit test that fails without
the fix**, then a row here. Plan session notes are not enough.

| ID | Date | Symptom | Root cause | Fix | Guard test(s) |
| --- | --- | --- | --- | --- | --- |
| R001 | 2026-08-06 | mon0 tab shows Chrome not Grok | belt `ensure_layout` anchors first id; stomps lastTabFocus | D016 preserve lastTabFocus + D014 belt no structure | `session-api-layout-cycle` layout TABBED re-affirm; `belt_actions` pin-moves-only |
| R002 | 2026-08-08 | same after cold open | mid-flight focus before chrome map; late activate steals | D017 focus + verify-once on lastTabFocus mismatch | `focus_actions_still_needed`; final focus verify in CLI |
| R005 | 2026-08-08 | cold X11: Chrome over Grok; wrong tab selected | first focus sticks then chrome/PWA late activate rewrites lastTabFocus; tab-active followed kbd not open leaf | D018 pin+restore; tab-active=lastTabFocus; SE5 pin 15s; SE3 soft barrier | `layout-open-leaf-pin`; `run_soft_focus_barrier`; `focus_actions_still_needed` |
| R006 | 2026-08-09 | fixed 250–2s reassert brittle across host speeds | soft residual not modeled; Meta has no settle ACK | D019 hard-ready 5s + soft barrier from settle-heuristics + post-settled verify once | `run_soft_focus_barrier`; `wait_until_hard_ready`; `test_settle_heuristics`; `TestTimeoutResilience` (soft undersize → verify/learn; hard timeout detect/continue; wall spin-safe) |
| R007 | 2026-08-09 | cold/mid: Chrome over Grok again; left ghostty not focused after layout | (1) active focus used Meta.activate → kbd thrash; (2) no-open path skipped soft barrier; (3) learned soft floor 400ms too short after opens; (4) RunSteps dropped `keyboard:false`; (5) save focus ignored floats / no LFT fallback | open-leaf focus `keyboard:false`; always final soft focus; cold soft floor 2s with pins; run-steps passthrough; save focus = last saved item (+ LFT); `--focus` CLI | `test_focus_active_open_leaf_no_keyboard`; `test_focus_from_float_*`; `test_parse_focus_cli_and_override` |
| R008 | 2026-08-09 | **true cold** mon0 Chrome New Tab over Grok (partial path green) | residual desk / pre-R007 path; **not** reproduced after R007 cold soft floor + pin | verified green SE8b (2× true cold Guake + partial) — R007 path holds | `L2.true-cold-dev` / R008 live; soft barrier + open-leaf pin |
| R009 | 2026-08-09 | `forge layout clean` / show fails on `{tiles:[]}` | `detect_layout_mode` required non-empty tiles | empty `tiles` list/dict + empty `roles:[]` count as reconcile sugar (CE1) | `test_empty_tiles_list_is_reconcile`; `test_empty_roles_list_is_reconcile` |
| R010 | 2026-08-09 | **Wayland** multi-open residual: mon1 tabs flat / wrong mon after first Mode A apply; second apply Mode B thrash-recover repaired | **Not** “Meta has no settled event” (that is **D019 soft residual** — intentional product fallback). R010 was **structure phase**: same-batch mon HSPLIT after TABBED flattened mon1; place+ensure without replan used pre-move mon paths | **Shipped:** mon-ensure skip when nested structure planned; residual place→structure replan. Soft residual + in-command verify = product (not a bug). Mode B as cold *success* still rejected. Re-check first-shot multi-open only as structure residual — do not treat soft-timeout as R010 | `partition_extension_steps_place_vs_structure`; mon-ensure skip in `layout_plan` |
| R003 | 2026-08-08 | left dock open → right mon | dock mon from focus/`get_current_monitor`; weak hook | D007 pointer mon + activate_full | `open-app-policy` focus mon0 + dock mon1; pointer geometry |
| R004 | 2026-08-08 | dock miss → focus mon; mon-root covers left tab | appId mismatch dropped pending; empty LFT(m) → mon-root 3rd HSPLIT child | single-pending match; `_lastTileOnMonitor` end-of-tree | `lft-mru` single unexpired mismatch; `open-app-policy` dock empty mon LFT |

## Agent live E2E (most important)

Unit tests are necessary but **not sufficient** for dual-mon layout. Agents
must run the **partial reload matrix** on X11 (never close agent Ghostty):

| Pre-state | Command |
| --- | --- |
| Ghosttys only | `forge layout dev` |
| Left chrome + ghostty | `forge layout dev` |
| Right ghostty (mon0 chrome gone) | `forge layout dev` |
| Left ghostty + nautilus | `forge layout t1` |

Full procedure + pass criteria: [HANDOFF.md](./HANDOFF.md) § Agent live E2E.
Guards open-leaf steal (R005/R006), mon claim (R001 class), dual ghostty reuse.

## Rules

1. **New live regression** → file row + failing **unit** test when pure, **and** a
   `LIVE_CASES` entry in `scripts/forge/live_matrix.py` tagged with that **R0xx**.  
2. **Do not** only “note in HANDOFF” without a test.  
3. Prefer pure helpers (`lft-mru.js`, `layout_apply.py`) so tests stay fast.  
4. Wayland host Shell cannot HUP — reload extension via **`forge nested restart`** (AT-W1); dual-mon host CT may still need one logout if host never loaded tip. CLI path is live immediately.  
5. Layout sign-off: **`forge test live plan/run`** with behaviors for the change —
   not the full catalog every time. Full auto only for release / large layout refactors.  
6. Select: `forge test live plan --tags R0xx` or `--from-work open-leaf|cold|…`.

## Related

- OP1 design: [docs/DESIGN.md](../docs/DESIGN.md) open-app placement  
- Decisions: D007, D014–D019 in [docs/DECISIONS.md](../docs/DECISIONS.md)  
- Task history: [completed/forge-dock-sticky-mon.md](./tasks/completed/forge-dock-sticky-mon.md)  
